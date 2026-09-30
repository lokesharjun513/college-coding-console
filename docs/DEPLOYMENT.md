# Deployment Guide

## 1. Prerequisites
- Node.js (>=18) and npm installed on the host (or Docker & Docker Compose).
- MongoDB Atlas cluster (or any MongoDB instance) reachable from the deployment environment.
- Judge0 API instance (or Judge0 rapidapi service) for code execution.
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
PORT=3000
MONGO_URI=your-mongodb-connection-string
JWT_ACCESS_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-a-different-long-random-secret
CORS_ORIGIN=https://your-frontend-domain.com,http://localhost:8080
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
JUDGE0_ENDPOINT=https://judge0-ce.p.rapidapi.com
JUDGE0_API_KEY=your-rapidapi-key
```
All variables are required in production. The application will abort startup if any are missing.

## 4. Frontend Environment Variables
Create a **.env** file in the `frontend/` directory (never commit it) or pass via build args with:
```
VITE_API_URL=https://your-backend-domain.com/api
```
Only the API base URL is needed; no secrets should be placed here.

---

## 5. Docker & Docker Compose Deployment (Recommended)

You can run the entire platform using Docker Compose with multi-stage production builds and Nginx SPA routing.

1. Create a `.env` file at the root directory containing your production secrets (`MONGO_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JUDGE0_ENDPOINT`, `JUDGE0_API_KEY`, `CORS_ORIGIN`, etc.).
2. Build and start containers:
   ```bash
   docker-compose up --build -d
   ```
3. Services running:
   - **Backend API**: `http://localhost:3000`
   - **Frontend (Nginx)**: `http://localhost:8080`

### Individual Docker Images
- **Backend**:
  ```bash
  cd backend
  docker build -t college-backend:latest .
  docker run -p 3000:3000 --env-file .env college-backend:latest
  ```
- **Frontend**:
  ```bash
  cd frontend
  docker build -t college-frontend:latest .
  docker run -p 8080:80 college-frontend:latest
  ```

---

## 6. Manual Production Build & Run

### Backend
```bash
cd backend
npm ci --omit=dev
npm start   # runs `node src/server.js`
```

### Frontend
```bash
cd frontend
npm ci
npm run build   # creates static `dist/` directory served by Nginx / static hosting
```

## 7. Health Check
- Endpoint: `GET /api/health`
- Expected JSON response:
  ```json
  {
    "success": true,
    "message": "API is healthy",
    "database": "connected"
  }
  ```
- Used for container health checks and load‑balancer probes.

## 8. Database Backup & Disaster Recovery

The platform relies on **MongoDB Atlas** for managed database hosting. Production data resilience and disaster recovery are handled via MongoDB Atlas built-in capabilities rather than application-level scheduled jobs or backup endpoints.

### Configured in Application vs Required Infrastructure
- **Configured in Application**: Connection pooling, retry writes (`retryWrites: true`), timeout limits, structured connection lifecycle logging, and graceful shutdown.
- **Required Cloud / Infrastructure Configuration (MongoDB Atlas)**:
  - **Automated Continuous Backups**: Enabled in Atlas console for Point-in-Time Recovery (PITR).
  - **Retention Policy**: Recommended 7 days of PITR window and 30-day daily snapshot retention.
  - **Encryption**: Encryption at rest (cloud provider KMS) and in transit (`tls=true`).
  - **Access Control**: Least privilege database users and enforced MFA on Atlas administrative accounts.

### Disaster Recovery & Restoration
- Refer to `docs/DATABASE_BACKUP_RUNBOOK.md` for complete backup runbooks, RPO (< 5 min), RTO (< 30 min), and emergency recovery procedures.
- Refer to `docs/DATABASE_RESTORE_CHECKLIST.md` for post-restore validation steps.

## 9. Troubleshooting
- **Cannot connect to MongoDB**: check `MONGO_URI`, network whitelist, and user permissions.
- **CORS errors**: ensure `CORS_ORIGIN` matches the exact frontend origin (including protocol).
- **JWT errors**: verify secrets are set correctly.
