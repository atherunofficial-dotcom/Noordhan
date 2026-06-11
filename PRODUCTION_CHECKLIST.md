# Production Readiness Pre-Flight Checklist

Use this checklist to verify the system before marking it fully production-ready.

## 📡 Backend Validation
- [ ] Render service deployed with no build errors.
- [ ] Environment variables configured correctly (`ANGEL_API_KEY`, `ANGEL_CLIENT_CODE`, `ANGEL_PASSWORD`, `ANGEL_TOTP`).
- [ ] Port set dynamically (`PORT` env var utilized).
- [ ] Health check endpoint `/health` returns status `UP` and database status `CONNECTED`.
- [ ] Automated Angel One login succeeds at boot (`✅ Successfully logged in!`).
- [ ] Caching update runs successfully in the background every 5 seconds.

## 💾 Database Validation
- [ ] Render PostgreSQL database created and initialized.
- [ ] Schema table `leads` verified / tables generated automatically during migrations.
- [ ] Test record inserted and queried successfully via the `/api/leads` route.
- [ ] Connection pool configured with SSL enabled (`rejectUnauthorized: false`).

## 💻 Frontend Validation
- [ ] Static copy of the landing page saved as `index.html` at the root.
- [ ] GitHub Pages activated on your repository.
- [ ] `API_BASE` resolver updated to point to `https://noordhan-backend.onrender.com` on production hostname.
- [ ] Screen reader-only labels added for form inputs (`sr-only` class applied).
- [ ] Backdrop blur filters checked for Safari cross-platform layouts (`-webkit-backdrop-filter` in use).
- [ ] Mobile navigation and dashboards stack vertically on responsive widths.

## 🔒 Security Hardening
- [ ] Hardcoded passwords or PINs removed from `server.js`.
- [ ] `ALLOWED_ORIGINS` CORS configuration whitelisted for your GitHub Pages domain.
- [ ] Health check does not expose sensitive database credentials or stack traces.
- [ ] HTTPS enforced on both backend API calls and frontend hosting.
