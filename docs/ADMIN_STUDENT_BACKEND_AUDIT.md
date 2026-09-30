# Admin Student Backend Audit

## 1. Executive Summary
- The Admin → Student backend provides CRUD operations, bulk upload, and a CSV template.
- Authentication (`requireAuth`) and admin‑only authorization (`requireRole('ADMIN')`) are enforced on all routes.
- Passwords are auto‑generated from the email prefix, hashed with bcrypt, and never returned in responses.
- No endpoint exists for individual student retrieval, server‑side search/filter, status‑only listing, password reset, or manual password specification.
- Bulk upload accepts a JSON array (max 500 rows) and validates each row; duplicate detection is performed per row.
- The implementation aligns partially with the documented requirements – several features are **NOT IMPLEMENTED**.
- Test coverage covers creation, validation, listing, update, and delete, but does **NOT** cover bulk upload edge‑cases, template download, or security‑related failure paths.

## 2. Actual Backend Architecture
```
Admin UI/API
   ↓
Router (backend/src/routes/admin/students.js)
   ↓
requireAuth (backend/src/middleware/auth.js) – JWT verification, user lookup, status check
   ↓
requireRole('ADMIN') (backend/src/middleware/role.js) – role check
   ↓
Request body validation (validateStudent function in students.js, lines 12‑18)
   ↓
Controller logic (create, list, update, delete, bulk, template) – lines 24‑166
   ↓
User model (backend/src/models/User.js, lines 4‑59) – Mongoose schema
   ↓
MongoDB persistence
   ↓
Response (JSON, passwordHash omitted via select('-passwordHash') in list, never included elsewhere)
```

## 3. Endpoint Matrix
| Feature | Method | Endpoint | Implemented | Auth | Validation | Response | Tests |
|---|---|---|---|---|---|---|---|
| Create student | POST | `/api/admin/students` | ✅ (lines 24‑52) | `requireAuth` + `requireRole('ADMIN')` (students.js line 24) | `validateStudent` (lines 12‑18) – required fields, email format, dept, batch years | 201 Created, returns id, name, email, rollNumber (no passwordHash) | adminStudents.test.js – creation & password behavior (lines 38‑63) |
| List students | GET | `/api/admin/students` | ✅ (lines 58‑65) | same middleware (line 58) | none (returns all students) | 200 OK, array of students (passwordHash excluded via `.select('-passwordHash')` line 60) | adminStudents.test.js – list (lines 103‑110) |
| Update student | PATCH | `/api/admin/students/:id` | ✅ (lines 71‑94) | same middleware (line 71) | `validateStudent` on merged object (lines 77‑79) | 200 OK, updated student object | adminStudents.test.js – update (lines 112‑128) |
| Delete student | DELETE | `/api/admin/students/:id` | ✅ (lines 100‑108) | same middleware (line 100) | none | 200 OK, success message | adminStudents.test.js – delete (lines 130‑136) |
| Bulk upload | POST | `/api/admin/students/bulk` | ✅ (lines 114‑155) | same middleware (line 114) | per‑row `validateStudent`, duplicate email/rollNumber checks (lines 122‑134) | 200 OK, `{created: n, errors: [...]}` | **No dedicated test** (bulk not exercised) |
| Download template | GET | `/api/admin/students/template` | ✅ (lines 161‑166) | same middleware (line 161) | none | CSV file download, Content‑Type `text/csv` | **No test** |
| View individual student | GET | `/api/admin/students/:id` | ❌ (no route) | — | — | — | — |
| Search / filter | GET (query params) | `/api/admin/students?…` | ❌ (no query handling) | — | — | — | — |
| Reset password | POST | `/api/admin/students/:id/reset-password` | ❌ | — | — | — | — |
| Manual password set | PATCH (password field) | `/api/admin/students/:id` | ❌ (passwordHash not accepted) | — | — | — | — |
| Assign / update batch, department, section | PATCH | `/api/admin/students/:id` | ✅ (fields accepted, lines 81‑87) | — | — | — | — |

## 4. Student Data Model
```
User Schema (backend/src/models/User.js, lines 4‑59)
- _id: ObjectId (auto)
- name: String, required, trim, maxlength 100
- email: String, required, trim, lowercase, unique, indexed
- passwordHash: String, required, select:false (never returned by default)
- role: Enum['ADMIN','TRAINER','STUDENT'], default 'STUDENT'
- status: Enum['ACTIVE','INACTIVE'], default 'ACTIVE'
- trainerId: String, sparse, unique, indexed (unused for students)
- rollNumber: String, sparse, unique, indexed
- department: Enum['CSE','IT','ECE','EEE','MECH','CIVIL']
- section: String, trim (optional)
- academicBatch: { startYear: Number, endYear: Number }
- timestamps: createdAt, updatedAt (auto)
```
Relationships (referenced by other models):
- **BatchStudent** (`backend/src/models/BatchStudent.js`) stores `student` (ObjectId → User) and `batch` (ObjectId → Batch).
- **Submission**, **ExecutionJob**, **PracticeSession** (not shown here) reference `student` via `userId`/`studentId` fields.
- Deleting a student via `findOneAndDelete` does **not** cascade to these collections – orphaned records may remain.

## 5. Create Student
- **Endpoint**: POST `/api/admin/students`
- **Body** (validated by `validateStudent`):
  - `name` (string, required)
  - `email` (string, required, email format, trimmed, lower‑cased)
  - `rollNumber` (string, required, trimmed)
  - `department` (string, required, must be one of `DEPARTMENTS` defined on line 9)
  - `section` (string, optional)
  - `academicBatch` (object with `startYear` and `endYear`, both required; `endYear` must be > `startYear`)
- **Processing** (lines 29‑45):
  - Email normalized, duplicate check on email or rollNumber.
  - Password generated via `generatePasswordFromEmail` (email prefix) – line 33.
  - Password hashed with `authService.hashPassword` – line 33.
  - New User created with role `STUDENT`, status `ACTIVE`.
- **Response** (line 47): 201 Created, JSON with `id`, `name`, `email`, `rollNumber`. No `passwordHash` is returned.
- **Error handling**: 400 Bad Request for validation, 409 Conflict for duplicate, 500 Internal Server Error for unexpected failures.

## 6. Password Generation & Security
- **Generation** (`authService.generatePasswordFromEmail`, lines 30‑36): extracts substring before `@`. Throws if `@` missing.
- **Hashing** (`authService.hashPassword`, lines 8‑12): bcrypt with 10 salt rounds (1 in test env).
- **Stored** as `passwordHash` (select:false, line 18‑22) – never returned by default queries.
- **Returned to admin**: No raw password is ever sent back. The only place a raw password appears is the temporary variable used to compute the hash (line 33) – not logged.
- **Logging**: No explicit logging of the password. Errors are logged without password data.
- **Manual password**: No API to set a custom password; password is always auto‑generated.
- **Reset**: No dedicated reset endpoint – admin cannot trigger a password reset via the backend.

## 7. List Students
- **Endpoint**: GET `/api/admin/students`
- **Implementation** (lines 58‑65): `User.find({ role: 'STUDENT' }).select('-passwordHash')` – returns all student documents without password hash.
- **Response shape**: `{ success: true, data: [ { _id, name, email, rollNumber, department, section, academicBatch, status, createdAt, updatedAt } ] }`
- **Pagination / filtering**: Not implemented – returns the full collection.
- **Frontend behaviour**: The frontend must perform any client‑side filtering or pagination.

## 8. Update Student
- **Endpoint**: PATCH `/api/admin/students/:id`
- **Implementation** (lines 71‑94):
  - Finds student by `_id` and role `STUDENT`.
  - Merges existing document with request body (`updateData = { ...student.toObject(), ...req.body }`).
  - Runs `validateStudent` on the merged object (lines 77‑79).
  - Applies allowed fields: `name`, `email`, `rollNumber`, `department`, `section`, `status`, `academicBatch` (lines 81‑87).
  - Saves the document and returns the full student object (including passwordHash? No, because schema `select:false` – but `.save()` returns full doc; the response includes all fields except passwordHash by default).
- **Immutable fields**: `_id`, `role`, `trainerId` cannot be changed.
- **Password**: Not updatable via this endpoint.
- **Validation**: Same as creation; duplicate email/rollNumber is **not** re‑checked – a duplicate could be introduced if the new email/rollNumber matches another existing student (the code does not query for duplicates on update).

## 9. Delete Student
- **Endpoint**: DELETE `/api/admin/students/:id`
- **Implementation** (lines 100‑108): `User.findOneAndDelete({ _id: req.params.id, role: 'STUDENT' })`
- **Response**: 200 OK with success message.
- **Side effects**: No cascade – related `BatchStudent` enrollments, `Submission`, `ExecutionJob`, etc., remain untouched, potentially leaving orphaned references.
- **Authorization**: Admin only (middleware).

## 10. Bulk Upload
- **Endpoint**: POST `/api/admin/students/bulk`
- **Payload**: JSON object `{ "students": [ <student objects> ] }` (line 116).
- **Limits**: Array must be non‑empty and ≤ 500 items (line 117).
- **Processing** (lines 119‑150):
  - Iterate over each row, run `validateStudent` (line 123).
  - Duplicate detection per row using `User.findOne` (line 130).
  - Generate password and hash per valid row (line 136).
  - Collect errors with row number (line 124‑127, 130‑134).
  - Insert all valid rows in a single `User.insertMany` (line 148).
- **Response**: `{ success: true, created: <count>, errors: [ { row, error } ] }`
- **Transaction**: No MongoDB transaction – if `insertMany` fails, earlier inserts are not rolled back. Errors are collected per row; a failure in one row does not stop processing of others.
- **Password**: Auto‑generated and hashed, same as single create.
- **Missing features**: No CSV parsing, no multipart file upload, no row‑level partial success (all valid rows are inserted, but errors are reported). No explicit max‑size enforcement beyond array length.

## 11. Template Download
- **Endpoint**: GET `/api/admin/students/template`
- **Implementation** (lines 161‑166): Returns a static CSV string with header `name,email,rollNumber,department,section,academicBatchStart,academicBatchEnd` and a single example row.
- **Headers**: `Content-Type: text/csv`, `Content-Disposition: attachment; filename=student_template.csv`.
- **Format**: CSV, not JSON. Bulk upload expects JSON, so the template does **not** match the bulk API payload – a mismatch.

## 12. Authorization
- All student routes are protected by `requireAuth` (backend/src/middleware/auth.js, lines 21‑80) and `requireRole('ADMIN')` (backend/src/middleware/role.js, lines 6‑23).
- JWT verification uses `process.env.JWT_ACCESS_SECRET` (fallback to `'testsecret'` in non‑production).
- No additional checks (e.g., ObjectId validation) beyond Mongoose casts; malformed IDs result in Mongoose cast errors caught by the generic `catch` block → 500 response.

## 13. Data Relationships
- **User** (`Student`) ↔ **BatchStudent** (`backend/src/models/BatchStudent.js`) – many‑to‑many enrollment.
- **User** ↔ **Submission** (`backend/src/models/Submission.js`) – each submission stores `student` reference.
- **User** ↔ **ExecutionJob**, **PracticeSession** – not shown but typical in the codebase; they reference the student by `userId`.
- Deleting a student does **not** cascade to these collections – orphaned documents may remain.

## 14. Validation
- Central `validateStudent` (students.js lines 12‑18) enforces:
  - Presence of `name`, `email`, `rollNumber`, `department`, `academicBatch.startYear`, `academicBatch.endYear`.
  - Email format via regex (line 10).
  - `endYear > startYear` (line 15).
  - Department must be one of `DEPARTMENTS` (line 16).
- No whitespace‑only checks beyond `trim()`.
- No explicit length limits on fields beyond schema constraints (e.g., `name` maxlength 100).
- Duplicate detection is performed at creation and bulk upload but **not** on update.

## 15. Test Coverage
- **adminStudents.test.js** covers:
  - Successful creation and password generation (lines 38‑63).
  - Required‑field validation (lines 65‑71).
  - Academic batch year validation (lines 73‑86).
  - Department validation (lines 88‑101).
  - Listing students (lines 103‑110).
  - Updating a student (lines 112‑128).
  - Deleting a student (lines 130‑136).
- **Missing tests**:
  - Bulk upload (success, error handling, limit enforcement).
  - Template download.
  - Unauthorized access (role/ auth failures).
  - Duplicate handling on update.
  - Orphan cleanup after delete.
  - Rate‑limiting enforcement.

## 16. Requirements Comparison
| Requirement | Backend Status | Evidence / File | Notes |
|---|---|---|---|
| **Create student** (name, email, rollNumber, batch start/end, department, optional section) | ✅ Implemented | `backend/src/routes/admin/students.js` lines 24‑45 | Validation present; password auto‑generated.
| **Password auto‑generated from email prefix** | ✅ Implemented | `authService.generatePasswordFromEmail` lines 30‑36; used in create (line 33) and bulk (line 136) |
| **Password hashed & never returned** | ✅ Implemented | `User.passwordHash` select:false (lines 18‑22); responses omit passwordHash (list line 60, create response line 47) |
| **Bulk upload (CSV upload, template download, row validation, duplicate detection, max 500 rows)** | ❌ Partially Implemented | Bulk endpoint accepts JSON array (lines 114‑155); template is CSV (lines 161‑166) but format mismatch; no CSV parsing; max 500 enforced (line 117) |
| **List students** (with pagination, search, status/department/batch filtering) | ❌ Not Implemented | List endpoint returns all students without filters (lines 58‑65) |
| **View individual student** | ❌ Not Implemented | No GET `/api/admin/students/:id` route |
| **Edit student** (including status, batch, department, section) | ✅ Implemented (partial) | PATCH route (lines 71‑94) updates fields; duplicate email/rollNumber not re‑checked |
| **Delete student** | ✅ Implemented | DELETE route (lines 100‑108) |
| **Assign / update academic batch** | ✅ Implemented (via create & patch) |
| **Assign / update department** | ✅ Implemented |
| **Assign / update section** | ✅ Implemented |
| **Reset student password** | ❌ Not Implemented | No endpoint for password reset |
| **Change student password manually** | ❌ Not Implemented | No password field accepted |
| **Admin‑only access** | ✅ Implemented | `requireAuth` + `requireRole('ADMIN')` on all routes |
| **PasswordHash never exposed** | ✅ Implemented | `select('-passwordHash')` in list; create response omits it; schema select:false |

## 17. Missing / Partial Features
- **Individual student retrieval** – missing.
- **Server‑side search, pagination, filtering** – missing.
- **Password reset / manual password set** – missing.
- **Bulk upload format mismatch** – template is CSV while API expects JSON.
- **Duplicate detection on update** – missing.
- **Cascade delete for related records** – missing (orphan risk).
- **Rate‑limiting per‑admin endpoint** – global limiter present (app.js line 53) but no per‑endpoint limits.
- **Error leakage** – generic 500 messages; no stack traces in production (good).

## 18. Risks
- **Orphaned records** after student deletion may cause data integrity issues.
- **Duplicate rollNumber/email on update** can lead to uniqueness violations.
- **Bulk upload CSV/template mismatch** may confuse admins and cause manual conversion errors.
- **No server‑side pagination** can lead to performance degradation with large student sets.
- **Password reset not available** forces admin to delete/re‑create students to change passwords.

## 19. Recommended Next Steps
1. Add a `GET /api/admin/students/:id` endpoint for individual retrieval.
2. Implement query parameters for pagination, search, and filtering (status, department, batch).
3. Provide a bulk upload endpoint that accepts CSV (multipart) and parses it, matching the downloadable template.
4. Enforce duplicate email/rollNumber checks on PATCH (update) operations.
5. Consider cascade delete or background cleanup of related `BatchStudent`, `Submission`, etc., when a student is removed.
6. Add dedicated tests for bulk upload, template download, and security edge cases (unauthorized access, duplicate update).
7. Document the expected request/response shapes in an OpenAPI spec for future client generation.
