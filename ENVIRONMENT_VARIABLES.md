# Environment Variables Specification: NoorDhan Investments

This document describes all environment variables used by the NoorDhan Investments backend API.

| Variable Name | Required | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `5000` | The port the Express API server listens on. |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated list of allowed CORS origins. For production, set to `https://atherunofficial-dotcom.github.io`. |
| `DATABASE_URL` | No | *None* | Connection string for Render PostgreSQL database. If omitted, the server falls back to local SQLite. |
| `ANGEL_API_KEY` | Yes | *None* | Application Key generated from the Angel One SmartAPI Developer Portal. Used for requests validation. |
| `ANGEL_CLIENT_CODE` | Yes | *None* | Your unique Angel One client ID (e.g. `AACE308803`). |
| `ANGEL_PASSWORD` | Yes | *None* | The PIN/password code used to log in to the Angel One account. |
| `ANGEL_TOTP` | Yes | *None* | The secret key seed used to generate dynamic time-based one-time passwords (TOTP) for 2FA. |

---

## 🔒 Secret Management Guidelines
1. **Never Commit Secrets**: Do not check `.env` into git. The `.gitignore` is already set up to protect it.
2. **Use Render Environment Settings**: On Render, configure these values in the Web Service's **Environment** tab, or supply them when creating the service from the `render.yaml` blueprint.
3. **Local Dev Setup**: Create a `.env` file inside the `NoorDhan-backend` directory for local development, matching the format of `.env.example`.
