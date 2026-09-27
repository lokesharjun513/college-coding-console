# Backend API Inventory

## Authentication
- `POST /api/auth/login`: Authenticate and get JWT. (Success: 200, Error: 400, 401, 500)
- `GET /api/auth/me`: Get current user info. (Auth: JWT, Success: 200, Error: 401, 500)

## Admin
### Trainers
- `POST /api/admin/trainers`: Create trainer. (Auth: JWT, Role: ADMIN, Success: 201, Error: 400, 401, 403, 500)
- `GET /api/admin/trainers`: List trainers. (Auth: JWT, Role: ADMIN, Success: 200, Error: 401, 403, 500)

### Batches
- `POST /api/admin/batches`: Create batch. (Auth: JWT, Role: ADMIN, Success: 201, Error: 400, 401, 403, 409, 500)
- `GET /api/admin/batches`: List batches. (Auth: JWT, Role: ADMIN, Success: 200, Error: 401, 403, 500)
- `GET /api/admin/batches/:id`: Get batch. (Auth: JWT, Role: ADMIN, Success: 200, Error: 400, 401, 403, 404, 500)
- `PATCH /api/admin/batches/:id`: Update batch. (Auth: JWT, Role: ADMIN, Success: 200, Error: 400, 401, 403, 404, 409, 500)
- `DELETE /api/admin/batches/:id`: Delete batch. (Auth: JWT, Role: ADMIN, Success: 200, Error: 400, 401, 403, 404, 500)

### Batch Students
- `POST /api/admin/batches/:batchId/students`: Enroll student. (Auth: JWT, Role: ADMIN, Success: 201, Error: 400, 401, 403, 404, 409, 500)
- `GET /api/admin/batches/:batchId/students`: List enrolled students. (Auth: JWT, Role: ADMIN, Success: 200, Error: 400, 401, 403, 404, 500)
- `GET /api/admin/batches/:batchId/students/:studentId`: Get enrollment details. (Auth: JWT, Role: ADMIN, Success: 200, Error: 400, 401, 403, 404, 500)
- `PATCH /api/admin/batches/:batchId/students/:studentId`: Update enrollment status. (Auth: JWT, Role: ADMIN, Success: 200, Error: 400, 401, 403, 404, 500)
- `DELETE /api/admin/batches/:batchId/students/:studentId`: Remove student. (Auth: JWT, Role: ADMIN, Success: 200, Error: 400, 401, 403, 404, 500)

## Trainer
### Batches
- `GET /api/trainer/batches`: List trainer batches. (Auth: JWT, Role: TRAINER, Success: 200, Error: 401, 403, 500)

### Problems
- `POST /api/trainer/batches/:batchId/problems`: Create problem. (Auth: JWT, Role: TRAINER, Success: 201, Error: 400, 401, 403, 404, 500)
- `GET /api/trainer/batches/:batchId/problems`: List problems. (Auth: JWT, Role: TRAINER, Success: 200, Error: 401, 403, 404, 500)

### Test Cases
- `POST /api/trainer/problems/:problemId/test-cases`: Create test case. (Auth: JWT, Role: TRAINER, Success: 201, Error: 400, 401, 403, 404, 500)
- `GET /api/trainer/problems/:problemId/test-cases`: List test cases. (Auth: JWT, Role: TRAINER, Success: 200, Error: 401, 403, 404, 500)

## Student
### Submissions
- `GET /api/student/submissions`: List submissions. (Auth: JWT, Role: STUDENT, Success: 200, Error: 401, 403, 500)
- `GET /api/student/submissions/:submissionId`: Get submission. (Auth: JWT, Role: STUDENT, Success: 200, Error: 400, 401, 403, 404, 500)
