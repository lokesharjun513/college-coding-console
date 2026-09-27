# Deployment Guide

## 1. Prerequisites
- Node.js (>=18) and npm installed on the host.
- MongoDB Atlas cluster (or any MongoDB instance) reachable from the deployment environment.
- A domain (or sub‑domain) for the frontend and a domain (or sub‑domain) for the backend API.

## 2. MongoDB Atlas Setup
1. Create a **MongoDB Atlas** cluster.
2. Create a database user with **readWrite** access to the application database only.
3. Whitelist the IP ranges of your deployment environment (or allow access from anywhere if you use VPC peering).
4. Obtain the connection string, e.g.:
   ```
   mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
   ```
5. Store the connection string in the backend environment variable **MONGO_URI**.

## 3. Backend Environment Variables
Create a **.env** file (never commit it) with the following placeholders:
```
NODE_ENV=production
PORT=5000   # or any port your platform provides
MONGO_URI=your-mongodb-connection-string
JWT_ACCESS_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-a-different-long-random-secret
CORS_ORIGIN=https://your-frontend-domain.com   # comma‑separated list if multiple origins
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=1d
```
All variables are required in production. The application will abort startup if any are missing.

## 4. Frontend Environment Variables
Create a **.env** file in the `frontend/` directory (never commit it) with:
```
VITE_API_BASE_URL=https://your-backend-domain.com/api
```
Only the API base URL is needed; no secrets should be placed here.

## 5. Backend Production Build & Run
```bash
# Install dependencies
cd backend
npm ci   # installs exact versions from package-lock.json

# Run tests (optional but recommended before deployment)
npm test -- --runInBand

# Build (no build step needed for backend)
# Start the server
npm start   # runs `node src/server.js`
```
The server reads `PORT` and binds to `0.0.0.0` (default for Express) which works on most PaaS platforms.

## 6. Frontend Production Build
```bash
cd frontend
npm ci
npm run lint   # ensure lint passes
npm run build   # creates a static `dist/` directory
```
Serve the `dist/` directory with any static‑file web server (e.g., Nginx, Vercel, Netlify, CloudFront). The build does not contain any hard‑coded URLs; it uses the value of `VITE_API_BASE_URL` at build time.

## 7. Deployment Order
1. Deploy the **backend** first so the health endpoint (`GET /api/health`) is reachable.
2. Deploy the **frontend** pointing to the backend URL via `VITE_API_BASE_URL`.
3. Verify CORS configuration – the backend must allow the exact frontend origin defined in `CORS_ORIGIN`.

## 8. CORS Configuration
- In production set `CORS_ORIGIN` to the exact protocol+domain of the frontend (e.g., `https://app.example.com`).
- Do **not** use `*` when credentials are involved.

## 9. Health Check
- Endpoint: `GET /api/health`
- Expected JSON response:
  ```json
  {
    "success": true,
    "message": "API is healthy",
    "database": "connected"
  }
  ```
- Use this for load‑balancer health probes.

## 10. Smoke Testing (after deployment)
- **Backend**: health, login, /auth/me, role‑based access, rate‑limit header, CORS header.
- **Trainer**: CRUD flow for batches, students, problems, test cases, performance.
- **Student**: login, dashboard, problem list, submission, verdict, history.
- **Security**: verify no stack traces, no passwordHash, no secrets in responses, HTTPS enforced.

## 11. Troubleshooting
- **Cannot connect to MongoDB**: check `MONGO_URI`, network whitelist, and user permissions.
- **CORS errors**: ensure `CORS_ORIGIN` matches the exact frontend origin (including protocol).
- **JWT errors**: verify `JWT_ACCESS_SECRET` is set and matches the value used to sign tokens.
- **Rate limiting**: 429 responses include `Retry‑After` header.

---
*All placeholders must be replaced with real values in the deployment environment. Do not commit any `.env` files.*
