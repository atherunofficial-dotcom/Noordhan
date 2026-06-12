require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OTPAuth = require('otpauth');
const axios = require('axios');
const { Pool } = require('pg');
const path = require('path');

const app = express();

// Parse JSON request bodies
app.use(express.json());

// CORS whitelist configuration using environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['*'];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or local files)
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin) || origin === 'null') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

// Initialize database connection based on environment
const usePostgres = !!process.env.DATABASE_URL;
let pgPool = null;
let sqliteDb = null;

if (usePostgres) {
    console.log("📡 DATABASE_URL detected. Initializing PostgreSQL client pool...");
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false // Required for Render PostgreSQL connection security
        }
    });
} else {
    console.log("💾 No DATABASE_URL detected. Initializing local SQLite database...");
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(__dirname, 'leads.db');
    sqliteDb = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error("❌ SQLite database connection error:", err.message);
        } else {
            console.log("✅ Connected to SQLite database.");
        }
    });
}

// Auto-run migrations at start
const runMigrations = () => {
    const postgresQuery = `
        CREATE TABLE IF NOT EXISTS leads (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50) NOT NULL,
            email VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    const sqliteQuery = `
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `;

    if (usePostgres) {
        pgPool.query(postgresQuery, (err) => {
            if (err) console.error("❌ PostgreSQL migration error:", err.message);
            else console.log("✅ PostgreSQL leads table verified/created.");
        });
    } else {
        sqliteDb.run(sqliteQuery, (err) => {
            if (err) console.error("❌ SQLite migration error:", err.message);
            else console.log("✅ SQLite leads table verified/created.");
        });
    }
};

runMigrations();

// Global variable to store our login token so we don't spam the login server
let GLOBAL_JWT_TOKEN = null;
let CACHED_MARKET_DATA = null;
let LAST_LOGIN_ERROR = null;

const getTOTP = () => {
    try {
        let totp = new OTPAuth.TOTP({
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(process.env.ANGEL_TOTP)
        });
        return totp.generate();
    } catch (err) {
        throw new Error(`Failed to generate TOTP: ${err.message}`);
    }
};

const getHeaders = (token = "") => {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': '127.0.0.1',
        'X-ClientPublicIP': '127.0.0.1',
        'X-MACAddress': '00-00-00-00-00-00',
        'X-PrivateKey': process.env.ANGEL_API_KEY
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
};

// 1. Function to Log in to Angel One
const loginToAngelOne = async () => {
    console.log("⏳ Attempting a secure login to Angel One...");
    
    // Validate required credentials
    const missing = [];
    if (!process.env.ANGEL_CLIENT_CODE) missing.push("ANGEL_CLIENT_CODE");
    if (!process.env.ANGEL_PASSWORD) missing.push("ANGEL_PASSWORD");
    if (!process.env.ANGEL_TOTP) missing.push("ANGEL_TOTP");
    if (!process.env.ANGEL_API_KEY) missing.push("ANGEL_API_KEY");
    
    if (missing.length > 0) {
        LAST_LOGIN_ERROR = `Missing required environment variables: ${missing.join(", ")}`;
        console.error(`❌ Login aborted: ${LAST_LOGIN_ERROR}`);
        return;
    }

    try {
        const loginPayload = {
            clientcode: process.env.ANGEL_CLIENT_CODE, 
            password: process.env.ANGEL_PASSWORD,
            totp: getTOTP()
        };
        
        const loginResponse = await axios.post(
            'https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword',
            loginPayload,
            { headers: getHeaders() }
        );

        if (loginResponse.data && loginResponse.data.status) {
            GLOBAL_JWT_TOKEN = loginResponse.data.data.jwtToken;
            console.log("✅ Successfully logged in! Security token securely cached.");
            LAST_LOGIN_ERROR = null;
        } else {
            LAST_LOGIN_ERROR = loginResponse.data ? loginResponse.data.message : "Unknown error from Angel One";
            console.error("❌ Angel One Rejected Login. Exact Error:", loginResponse.data.message);
        }
    } catch (error) {
         LAST_LOGIN_ERROR = error.message;
         console.error("❌ Login API Connection Error:", error.message);
    }
};

// 2. Fetch Live Market Data and Cache it in memory
const fetchMarketDataAndCache = async () => {
    if (!GLOBAL_JWT_TOKEN) {
        console.log("⏳ Skipping market data fetch: No active JWT token cached.");
        return;
    }

    try {
        const marketPayload = {
            mode: "FULL",
            exchangeTokens: {
                "NSE": ["99926000", "99926009"], // NIFTY 50 & BANKNIFTY
                "BSE": ["99919000"]              // SENSEX
            }
        };

        const marketResponse = await axios.post(
            'https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote/',
            marketPayload,
            { headers: getHeaders(GLOBAL_JWT_TOKEN) }
        );

        if (marketResponse.data && marketResponse.data.status) {
            CACHED_MARKET_DATA = marketResponse.data;
            console.log("📈 Cached live index prices smoothly!");
        } else {
            console.error("❌ Angel One API returned quotes error:", marketResponse.data.message);
            // Handle token expiry code (AG8001 is common for session expiry)
            if (marketResponse.data.errorcode === "AG8001" || marketResponse.data.message === "Invalid Token") {
                console.log("🔑 Session expired. Triggering automated re-login...");
                GLOBAL_JWT_TOKEN = null;
                await loginToAngelOne();
            }
        }

    } catch (error) {
        console.error("❌ Market Data Fetch Connection Error:", error.message);
        // Handle auth errors (HTTP 401/403)
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            console.log("🔑 HTTP Auth error. Triggering automated re-login...");
            GLOBAL_JWT_TOKEN = null;
            await loginToAngelOne();
        }
    }
};

// 3. API Endpoint to retrieve cached live market data
app.get('/api/market-data', (req, res) => {
    if (!CACHED_MARKET_DATA) {
        return res.status(503).json({ 
            error: "Backend is currently syncing with market feed. Please wait...",
            details: {
                hasToken: !!GLOBAL_JWT_TOKEN,
                lastLoginError: LAST_LOGIN_ERROR
            }
        });
    }
    res.json(CACHED_MARKET_DATA);
});

// 4. API Endpoint to capture and save user leads
app.post('/api/leads', async (req, res) => {
    const { name, phone, email } = req.body;
    
    if (!name || !phone || !email) {
        return res.status(400).json({ error: "Missing required fields: name, phone, email" });
    }

    if (usePostgres) {
        try {
            const query = "INSERT INTO leads (name, phone, email) VALUES ($1, $2, $3) RETURNING id";
            const result = await pgPool.query(query, [name, phone, email]);
            const leadId = result.rows[0].id;
            res.status(201).json({ 
                success: true, 
                message: "Lead captured successfully", 
                leadId: leadId 
            });
            console.log(`👤 Captured Lead (Postgres): ${name} (${phone}) - ID: ${leadId}`);
        } catch (err) {
            console.error("❌ PostgreSQL database insert error:", err.message);
            res.status(500).json({ error: "Failed to save lead to database" });
        }
    } else {
        sqliteDb.run(
            "INSERT INTO leads (name, phone, email) VALUES (?, ?, ?)",
            [name, phone, email],
            function(err) {
                if (err) {
                    console.error("❌ SQLite database insert error:", err.message);
                    return res.status(500).json({ error: "Failed to save lead to database" });
                }
                res.status(201).json({ 
                    success: true, 
                    message: "Lead captured successfully", 
                    leadId: this.lastID 
                });
                console.log(`👤 Captured Lead (SQLite): ${name} (${phone}) - ID: ${this.lastID}`);
            }
        );
    }
});

// 5. Health Check Endpoint
app.get('/health', async (req, res) => {
    try {
        if (usePostgres) {
            await pgPool.query('SELECT 1');
        } else {
            await new Promise((resolve, reject) => {
                sqliteDb.get('SELECT 1', (err) => err ? reject(err) : resolve());
            });
        }
        res.status(200).json({ 
            status: "UP", 
            database: "CONNECTED",
            angelOne: {
                connected: !!GLOBAL_JWT_TOKEN,
                lastError: LAST_LOGIN_ERROR
            }
        });
    } catch (err) {
        console.error("❌ Health check failure:", err.message);
        res.status(500).json({ status: "DOWN", error: err.message });
    }
});

// Background job: Poll Angel One for quotes every 5 seconds to update cache
setInterval(fetchMarketDataAndCache, 5000);

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    console.log(`✅ Secure backend is running on port ${PORT}!`);
    // Trigger login on server startup
    await loginToAngelOne();
    // Fetch initial market data once on server startup
    await fetchMarketDataAndCache();
});
