# TRAINER BACKEND SOURCE OF TRUTH

This document establishes the authoritative source of truth for all TRAINER backend endpoints based on direct source code inspection (`backend/src/`).

## 1. Summary of Trainer Endpoints

Total active trainer endpoints: **20**

### Batch & Student Management (`backend/src/routes/trainer/batches.js`)
1. **GET `/api/trainer/batches`**
   - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
   - Ownership: Returns batches where `trainer: req.user.id`
   - Response: List of batches with populated trainer and student counts.

2. **GET `/api/trainer/batches/:id`**
   - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
   - Ownership: Verifies `batch.trainer === req.user.id`
   - Response: Single batch details with student count.

3. **GET `/api/trainer/batches/:batchId/students`**
   - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
   - Ownership: Verifies `batch.trainer === req.user.id`
   - Response: List of enrollments (`BatchStudent`) populated with student details.

4. **GET `/api/trainer/batches/:batchId/students/:studentId`**
   - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
   - Ownership: Verifies `batch.trainer === req.user.id`
   - Response: Single enrollment record.

5. **POST `/api/trainer/batches/:batchId/students`**
   - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
   - Ownership: Verifies `batch.trainer === req.user.id`
   - Body: `{ studentId }`
   - Response: Created enrollment record.

6. **PATCH `/api/trainer/batches/:batchId/students/:studentId`**
   - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
   - Ownership: Verifies `batch.trainer === req.user.id`
   - Body: `{ status }` (`ACTIVE` / `INACTIVE`)
   - Response: Updated enrollment.

7. **DELETE `/api/trainer/batches/:batchId/students/:studentId`**
   - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
   - Ownership: Verifies `batch.trainer === req.user.id`
   - Response: Success (`data: null`).

### Problem Management (`backend/src/routes/trainer/problems.js`)
8. **GET `/api/trainer/batches/:batchId/problems`**
   - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
   - Ownership: Verifies `batch.trainer === req.user.id`
   - Response: List of problems for the batch.

9. **POST `/api/trainer/batches/:batchId/problems`**
   - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
   - Ownership: Verifies `batch.trainer === req.user.id`
   - Body: `title`, `description`, `difficulty` (EASY/MEDIUM/HARD), `constraints`, `inputFormat`, `outputFormat`, `examples`, `starterCode`, `allowedLanguages`, `status` (DRAFT/PUBLISHED/ARCHIVED)
   - Response: Created problem.

10. **GET `/api/trainer/batches/:batchId/problems/:problemId`**
    - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
    - Ownership: Verifies problem belongs to `batchId` and `batch.trainer === req.user.id`
    - Response: Problem details.

11. **PATCH `/api/trainer/batches/:batchId/problems/:problemId`**
    - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
    - Ownership: Verifies problem belongs to `batchId` and `batch.trainer === req.user.id`
    - Body: Problem update fields.
    - Response: Updated problem.

12. **DELETE `/api/trainer/batches/:batchId/problems/:problemId`**
    - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
    - Ownership: Verifies problem belongs to `batchId` and `batch.trainer === req.user.id`
    - Action: Soft archive (`status: 'ARCHIVED'`)
    - Response: Success (`data: null`).

### Test Case Management (`backend/src/routes/trainer/testCases.js`)
13. **GET `/api/trainer/problems/:problemId/test-cases`**
    - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
    - Ownership: Middleware `verifyProblemOwnership` checks TestCase -> Problem -> Batch -> Trainer.
    - Response: List of test cases.

14. **POST `/api/trainer/problems/:problemId/test-cases`**
    - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
    - Ownership: Middleware `verifyProblemOwnership`.
    - Body: `input`, `expectedOutput`, `isHidden`, `sampleExplanation`, `order`.
    - Response: Created test case.

15. **GET `/api/trainer/problems/:problemId/test-cases/:testCaseId`**
    - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
    - Ownership: Middleware `verifyProblemOwnership`.
    - Response: Single test case.

16. **PATCH `/api/trainer/problems/:problemId/test-cases/:testCaseId`**
    - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
    - Ownership: Middleware `verifyProblemOwnership`.
    - Body: Test case update fields.
    - Response: Updated test case.

17. **DELETE `/api/trainer/problems/:problemId/test-cases/:testCaseId`**
    - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
    - Ownership: Middleware `verifyProblemOwnership`.
    - Response: Success (`data: null`).

### Performance Analytics (`backend/src/routes/trainer/performance.js`)
18. **GET `/api/trainer/performance/batch/:batchId`**
    - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
    - Ownership: Verifies `batch.trainer === req.user.id`.
    - Response: Aggregated batch metrics (total students, active students, total problems, total submissions, solved problems, progress %).

19. **GET `/api/trainer/performance/student/:studentId`**
    - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
    - Ownership: Verifies student enrollment in a batch owned by `req.user.id`.
    - Response: Student performance summary.

20. **GET `/api/trainer/performance/problem/:problemId`**
    - Auth: Required (`requireAuth`, `requireRole('TRAINER')`)
    - Ownership: Verifies problem batch owned by `req.user.id`.
    - Response: Problem performance breakdown across students.

---

## 2. Status of Unexposed / Missing Capabilities

- **Dashboard Summary Endpoint:** ❌ NOT IMPLEMENTED (No `/api/trainer/dashboard`).
- **Batch Creation / Editing / Deletion:** ❌ NOT IMPLEMENTED (Admin only under `/api/admin/batches`).
- **Direct Submission Review / Execution Inspector:** ❌ NOT IMPLEMENTED.
- **Practice Tracking / Active Sessions:** ❌ NOT IMPLEMENTED.
- **Global Questions / Training Zones:** ❌ NOT IMPLEMENTED.
