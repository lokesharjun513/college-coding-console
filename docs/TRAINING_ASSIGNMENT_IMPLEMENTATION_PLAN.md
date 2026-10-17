# Training Assignment Implementation Plan

**Project:** D:\Projects\Portal\coding-console\college
**Generated:** 2026‑10‑13
**Updated:** 2026‑10‑13 — Phase 1 complete; scope changed to **open‑ended practice** (no deadline, no time limit); both model suites executed and passing.
**Phase 2:** 2026‑10‑13 — trainer + student assignment API routes, completion service (unwired), and focused API tests implemented and passing. See section 6.
**Phase 3:** 2026‑10‑13 — an `ACCEPTED` submission now records assignment completions; verdict mismatch and `acceptedSubmission` validation resolved. See section 7.
**Phase 4:** 2026‑10‑13 — trainer assignment management page, student assignment feed, API clients and one additive read-only backend endpoint. See section 8.

---

## 0. Requirement Change — Open‑Ended Practice Assignments

> **Assignments have NO deadline and NO time limit.** Students can practise and
> complete assignments at any time. The trainer only monitors how many students
> completed each assignment and how many are still pending.

The original plan carried a `dueDate` field and a `dueDate >= availableFrom`
validator. **Both were removed.** The concrete model‑level consequences:

| Requirement | How it is enforced |
| --- | --- |
| 1. No `dueDate`, no deadline‑based completion | `dueDate` no longer exists in the schema (`Assignment.schema.path('dueDate')` is `undefined`). No completion logic reads a date. |
| 2. Never reject an assignment because of elapsed time | No validator, pre‑hook, default or index derives anything from the current time. An assignment created with `availableFrom` in 2015 still saves and is still updatable. |
| 3. Availability separate from completion status | `availableFrom` = availability. `status` = lifecycle (`ACTIVE`/`COMPLETED`/`CANCELLED`). Neither is computed from the other; `status` only changes when explicitly set. |
| 4. Completion tracked per assignment + student | `AssignmentCompletion` is keyed on `(assignment, student)`, never on `problem`. |
| 5. An accepted solution completes the assignment | A completion record with the accepted submission is the marker a trainer counts. Recording a completion does **not** mutate `Assignment.status`. |
| 6. Batch isolation | The unique index and every completion query include `assignment` (which carries `batch`), so completing batch A can never satisfy batch B's assignment of the same problem. |
| 7. Submissions allowed after completion | The unique index guards the **completion** collection only. `Submission` has no guard, so further attempts still save; the completion record and its `acceptedSubmission` stay unchanged. |

---

## 1. Verified Current‑State Findings

(see earlier audit – unchanged)

---

## 2. Phase 1 – Model Implementation

### 2.1 Assignment Model (`backend/src/models/Assignment.js`) — FINAL
```js
const mongoose = require('mongoose');

// Open-ended practice assignment.
//
// There is NO due date and NO time limit: a student may start (once
// `availableFrom` has passed) and finish at any later point. Nothing in this
// schema derives or enforces a deadline, and nothing here is computed from
// elapsed time.
//
// `availableFrom` is *availability*; `status` is the *lifecycle/completion*
// state. The two are deliberately independent: an assignment that has been
// available for years is still ACTIVE until a trainer changes its status.
const assignmentSchema = new mongoose.Schema(
  {
    // Problem being assigned (GLOBAL or BATCH‑scoped)
    problem: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
    // Batch that receives the assignment
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
    // Trainer who created the assignment – derived from batch.trainer for audit
    trainer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Optional human‑readable title (defaults to problem.title)
    title: { type: String },
    // When students can start working on it. Availability only – no deadline.
    availableFrom: { type: Date, default: null },
    // Assignment lifecycle status (independent of availableFrom)
    status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' },
    // Soft‑delete flag – keeps historic data safe
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Allow the same problem to be assigned to the same batch on different dates.
// Unique per batch+problem+availableFrom when not deleted.
assignmentSchema.index(
  { batch: 1, problem: 1, availableFrom: 1 },
  { unique: true, partialFilterExpression: { deleted: false } }
);

module.exports = mongoose.model('Assignment', assignmentSchema);
```
**Key points**
- Required references: `problem`, `batch`, `trainer`.
- `availableFrom` is the **only** date. It gates availability, never expiry.
- `status` is a trainer‑controlled lifecycle flag; nothing derives it.
- Soft‑delete via `deleted`; the compound unique index is partial on `deleted: false`.
- The unique index permits the same problem on the same batch on **different dates**, and the same problem on the same date in **different batches**. It does not prevent assignments on different dates.

### 2.2 AssignmentCompletion Model (`backend/src/models/AssignmentCompletion.js`) — FINAL
```js
const mongoose = require('mongoose');

// A completion is recorded per (assignment, student) – NOT per (problem,
// student). The same problem assigned to two different batches produces two
// independent assignments, and completing one must never complete the other.
const completionSchema = new mongoose.Schema(
  {
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Verdict that satisfied the assignment (normally ACCEPTED)
    verdict: { type: String, enum: ['ACCEPTED', 'PARTIAL', 'WRONG_ANSWER'], required: true },
    // Reference to the accepted submission (useful for audit)
    acceptedSubmission: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One completion per (assignment, student)
completionSchema.index({ assignment: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('AssignmentCompletion', completionSchema);
```
**Key points**
- Required references: `assignment`, `student`, `acceptedSubmission`; `verdict` is a required enum.
- The unique `(assignment, student)` index makes completion recording idempotent — re‑recording is a no‑op, not a new row.
- `acceptedSubmission` keeps the audit trail for *which* attempt counted, even though later attempts remain allowed.

### 2.3 Index audit
| Schema | Index declarations | Duplicate declarations? |
| --- | --- | --- |
| `Assignment` | `{ batch, problem, availableFrom }` unique, partial `deleted:false` | **None** — exactly one. |
| `AssignmentCompletion` | `{ assignment, student }` unique | **None** — exactly one. |

Nothing was removed. Verified live in the test database:
`assignments` indexes = `_id_` + `batch_1_problem_1_availableFrom_1` (unique, `partialFilterExpression: { deleted: false }`). No index blocks assignments on different dates.

---

## 3. Focused Tests Added — EXACT RESULTS

Both suites were run against `.env.test` (`CodingConsoleTest`) with the required commands.

```
npm test -- --runInBand tests/assignment.test.js
  Test Suites: 1 passed, 1 total
  Tests:       18 passed, 18 total

npm test -- --runInBand tests/assignmentCompletion.test.js
  Test Suites: 1 passed, 1 total
  Tests:       17 passed, 17 total
```

**`backend/tests/assignment.test.js` — 18/18 passing**
- create a valid assignment (incl. read‑back from Mongo)
- require `problem` / require `batch` / require `trainer` reference
- validate `status` enum
- accept every valid status value (`ACTIVE`, `COMPLETED`, `CANCELLED`) and default to `ACTIVE`
- **no due date / deadline field exists at all** (`dueDate`, `deadline`, `expiresAt`, `timeLimit` all undefined)
- **assignment available for years still saves** (`availableFrom` 2019‑01‑01)
- **not rejected or auto‑closed because of elapsed time** (2015‑06‑01 still `ACTIVE`, still updatable to `COMPLETED`)
- **availability separate from completion status** (`availableFrom` in the past never changes `status`; `status` only changes explicitly)
- allow omitting `availableFrom`
- default `deleted` to false / allow setting `deleted` to true
- enforce unique index on `batch, problem, availableFrom` when not deleted
- allow same batch + problem with different `availableFrom`
- allow same problem + same `availableFrom` for a **different batch**
- treat a date‑less assignment as a single slot per batch+problem
- free the unique slot once the previous assignment is soft‑deleted (historic row retained)

**`backend/tests/assignmentCompletion.test.js` — 17/17 passing**
- create a valid assignment completion (incl. read‑back)
- resolve `assignment`, `student`, `acceptedSubmission` references via `populate`
- require `assignment` / `student` / `verdict` / `acceptedSubmission`
- validate `verdict` enum
- accept every valid verdict value (`ACCEPTED`, `PARTIAL`, `WRONG_ANSWER`)
- allow an explicit `completedAt`
- **accepted solution marks that student's assignment complete** (completion is queryable; `Assignment.status` stays `ACTIVE`)
- **trainer can count completed vs pending students** for an assignment
- **track completion per assignment, not per problem**
- **completing one batch does not complete the same problem in another batch** (and the other batch can be completed independently)
- **allow more submissions after completion** (3 submissions for the same student+problem; completion record and its `acceptedSubmission` unchanged)
- enforce unique index on `assignment` + `student`
- allow different student for same assignment
- allow same student for different assignment

### 3.1 Root cause of the original failures
Both suites died in `beforeAll` with `ValidationError: Problem validation failed: createdBy: Path 'createdBy' is required.`
`Problem.createdBy` is a required field, and the fixtures created problems
without it. Secondary fixture defects found and corrected: `Submission.language`
was `'javascript'`, which is **not** in the model's enum (the provider has no
JS compiler). All fixtures now use the real field names and enum values; no
validation was bypassed and no required field was weakened.

---

## 4. Compatibility & Integrity Considerations

- No changes were made to the existing `Problem` schema (the `batch` field remains a single ObjectId). The new `Assignment` model references the problem without altering the problem itself – fully backward compatible.
- Existing trainer‑problem routes continue to work unchanged; assignments are an **additional** layer.
- The unique index on `{ batch, problem, availableFrom }` respects the requirement that the same problem may be assigned to the same batch on **different dates**.
- No unique `{ batch, problem }` index is introduced.
- Soft‑delete (`deleted`) ensures historic data is retained while allowing a new assignment with the same batch/problem/availableFrom after a deletion.
- `AssignmentCompletion` does **not** embed completions inside `Assignment`; a separate collection avoids document‑size limits and simplifies idempotent writes.
- Hidden test‑case outputs remain protected – the new models do not expose any test‑case data.

---

## 5. Open Findings (carry into Phase 2)

1. **`title` is never defaulted.** The comment says "defaults to problem.title" but no default is implemented — resolving it needs a cross‑document lookup, so it belongs in a service layer, not the schema.
2. **`verdict` enum vs `Submission.verdict` enum — RESOLVED in Phase 3.** `AssignmentCompletion.verdict` was `['ACCEPTED', 'PARTIAL', 'WRONG_ANSWER']`; `PARTIAL` existed nowhere else in the codebase and has been removed. The enum is now `['ACCEPTED', 'WRONG_ANSWER']`, a strict subset of `Submission.verdict`. See section 7.1.
3. **`acceptedSubmission` is required for every verdict.** Partly resolved in Phase 3: the service now guarantees the reference is a persisted, `ACCEPTED` submission belonging to the same student and problem. The field is still `required` on the model, and `WRONG_ANSWER` completions are still legal but never written by the automatic path. See section 7.5.
4. **Partial index edge case.** `partialFilterExpression: { deleted: false }` only indexes documents where `deleted` is present and `false`. Mongoose always applies the default, so documents written through the model are covered; documents written by raw driver/import scripts that omit `deleted` would bypass uniqueness.
5. **Two date‑less assignments collide.** `availableFrom` defaults to `null`, and `null` is a valid index key, so a problem can only be assigned once per batch without an explicit date. Intended, and now covered by a test — but Phase 2 should make the API require `availableFrom` for a second assignment.
6. **`Assignment.status` is not auto‑derived.** Nothing sets it to `COMPLETED` when all enrolled students complete. Decide whether per‑student completion or whole‑assignment status is the source of truth for trainer reporting.

---

## 6. Phase 2 – API Routes (IMPLEMENTED)

### 6.1 Route mounting

Both routers are mounted in `backend/src/app.js`:

```js
// Trainer assignment management (open-ended practice)
app.use('/api/trainer/batches/:batchId/assignments', require('./routes/trainer/assignments'));

// Student assignment feed (open-ended practice)
app.use('/api/student/assignments', require('./routes/student/assignments'));
```

The trainer router is created with `express.Router({ mergeParams: true })` so
`:batchId` is visible from the mount path. It sits next to the existing
`/api/trainer/batches/:batchId/problems` mount and does not interfere with it —
`routes/trainer/batches.js` only matches single-segment paths such as `/:id`.

### 6.2 Trainer endpoints — `backend/src/routes/trainer/assignments.js`

| Method | Path | Success |
| --- | --- | --- |
| POST | `/api/trainer/batches/:batchId/assignments` | `201` |
| GET | `/api/trainer/batches/:batchId/assignments?includeDeleted=true` | `200` |
| GET | `/api/trainer/batches/:batchId/assignments/:assignmentId` | `200` |
| PATCH | `/api/trainer/batches/:batchId/assignments/:assignmentId` | `200` |
| DELETE | `/api/trainer/batches/:batchId/assignments/:assignmentId` | `200` |

Request body for POST — there is **no deadline parameter**:
`{ problemId (required), title?, availableFrom?, status? }`
`availableFrom` accepts an ISO date, or is omitted/`null` (meaning "available
immediately"). `status` is one of `ACTIVE` / `COMPLETED` / `CANCELLED`.

PATCH accepts only `title`, `availableFrom`, `status`.

Every response carries a `monitoring` block derived from
`AssignmentCompletion` + active `BatchStudent` enrollments:
`{ enrolledStudents, completed, pending }`.

Status codes: `400` invalid ids / missing `problemId` / invalid `status` /
invalid `availableFrom` / non-string `title` / unpublished problem;
`401` unauthenticated; `403` wrong role or batch not owned by the trainer;
`404` unknown batch, problem or assignment; `409` duplicate assignment.

### 6.3 Student endpoints — `backend/src/routes/student/assignments.js`

| Method | Path | Success |
| --- | --- | --- |
| GET | `/api/student/assignments` | `200` |
| GET | `/api/student/assignments/:assignmentId` | `200` |

Student identity comes from the verified token (`req.user.id`) only. The list
response includes `meta: { enrolled, activeBatches, total, completed, pending }`.
Each item carries `completed` and `completion: { verdict, completedAt }`.

Status codes: `400` invalid assignment id; `401` unauthenticated; `403` non
student role; `404` unknown assignment or an assignment outside the student's
visible set.

### 6.4 Authorization rules implemented

| Rule | Where | Behaviour |
| --- | --- | --- |
| Authentication + role | `requireAuth`, `requireRole('TRAINER')` / `requireAnyRole('STUDENT')` | `401` / `403` |
| Trainer owns the batch | `services/trainerAuth.assertTrainerOwnsBatch` | `400` invalid, `404` unknown, `403` not owned (an unassigned batch belongs to nobody) |
| Assignment ownership | `loadOwnedAssignment` filters `{ batch, trainer: req.user.id, deleted: false }` | `404` for another trainer's assignment even inside your own batch |
| GLOBAL problems assignable | `assertProblemAssignable` | allowed from any batch |
| Own BATCH problems | `assertProblemAssignable` | allowed only when `problem.createdBy === trainer` **and** `problem.batch === batchId` |
| Another trainer's private problem | `assertProblemAssignable` | `403` |
| Only published problems | `assertProblemAssignable` | `400` — students can only open `PUBLISHED` problems, so an unpublished problem would create an assignment nobody can start |
| Client cannot override `trainer` / `problem` / `batch` | POST ignores body `trainer`/`batch`; PATCH ignores `problem`/`batch`/`trainer`/`deleted` | stored values always server-owned |
| Duplicate conflict | pre-check + `E11000` fallback | `409` `DUPLICATE_ASSIGNMENT` |
| Soft delete | `DELETE` sets `deleted: true` | row retained, partial unique index frees the slot |
| Student enrollment | `BatchStudent { status: 'ACTIVE' }` | assignments outside those batches are never listed, and the detail route returns `404` so it cannot be used to probe other batches |
| Availability | `availableFrom: null` **or** `availableFrom <= now` | future assignments are hidden; nothing ever expires |
| Cancellation / deletion | `status: 'ACTIVE'` **and** `deleted: false` | cancelled and soft-deleted assignments are hidden |
| Hidden test-case protection | `TestCase` is never queried by either router | student payload uses an explicit `Problem` field allow-list |

### 6.5 Completion service — `backend/src/services/assignmentCompletion.js`

`recordAssignmentCompletion({ studentId, problemId, submissionId, verdict, completedAt })`
finds every `ACTIVE`, non-deleted, already-available assignment for that problem
in a batch the student is actively enrolled in, and upserts one
`AssignmentCompletion` per `(assignment, student)` using `$setOnInsert`. Re-running
it is a no-op that preserves the first `acceptedSubmission` and `completedAt`;
a concurrent duplicate (Mongo `11000`) is reported in `skipped` rather than
thrown. Helpers `getActiveEnrolledBatchIds`, `findCompletableAssignments` and
`getCompletionMap` are reused by the student routes.

**The submission flow was intentionally NOT modified.** The integration point
for Phase 3 is documented at the top of `services/assignmentCompletion.js`: in
`backend/src/routes/student/submissions.js`, directly after the
`Submission.create({...})` call, invoke the service only when
`overallVerdict === 'ACCEPTED'`, and never let a completion failure fail the
submission.

### 6.6 Phase 2 test commands and exact results

```
npm test -- --runInBand tests/trainerAssignments.test.js
  Test Suites: 1 passed, 1 total
  Tests:       30 passed, 30 total

npm test -- --runInBand tests/studentAssignments.test.js
  Test Suites: 1 passed, 1 total
  Tests:       20 passed, 20 total
```

Combined run — new API tests, the two Phase 1 model suites, and the directly
affected existing trainer batch/problem/enrollment suites:

```
npm test -- --runInBand tests/assignment.test.js tests/assignmentCompletion.test.js \
  tests/trainerAssignments.test.js tests/studentAssignments.test.js \
  tests/trainerBatches.test.js tests/trainerProblems.test.js \
  tests/trainerProblemAssociation.test.js tests/trainerUnassignedBatchAccess.test.js
  Test Suites: 8 passed, 8 total
  Tests:       149 passed, 149 total

npm test -- --runInBand tests/studentProblems.test.js tests/studentSubmissions.test.js \
  tests/trainerEnrollment.test.js tests/trainerTrainingAccess.test.js
  Test Suites: 4 passed, 4 total
  Tests:       57 passed, 57 total
```

**12 suites / 206 tests passing, 0 failures.** The full backend suite was
intentionally not run.

**`tests/trainerAssignments.test.js` — 30 tests** covering: GLOBAL assignment
creation, own batch-scoped problem assignment, client-supplied `trainer`/`batch`/
`deleted` being ignored, duplicate `409`, same problem on a different
`availableFrom`, missing/invalid/unknown problem and batch ids, invalid status,
invalid `availableFrom`, non-string title, another trainer's private problem
(`403`), own problem scoped to another batch (`403`), DRAFT/ARCHIVED problems
(`400`), unauthenticated (`401`), student token (`403`), cross-trainer access on
all five endpoints (`403`), foreign assignment inside your own batch (`404`),
list filtering with `includeDeleted`, invalid/unknown assignment ids, PATCH of
title/status/availableFrom, PATCH immutability of `problem`/`batch`/`trainer`/
`deleted`, PATCH to a conflicting date (`409`), invalid PATCH status, soft
delete + slot reuse + second delete `404`, hidden test-case protection, and the
completed/pending monitoring counts.

**`tests/studentAssignments.test.js` — 20 tests** covering: unauthenticated
(`401`), trainer token (`403`), no enrollment, active enrollment listing,
non-enrolled batch hidden (list and detail `404`), inactive enrollment hidden,
future `availableFrom` hidden, past `availableFrom` shown, cancelled and
soft-deleted hidden, invalid/unknown assignment id, per-assignment completion
status, cross-batch completion isolation, global submission history **not**
treated as assignment completion, another student's completion invisible
(including a `?studentId=` spoof attempt), hidden test-case and trainer-identity
protection with an exact allow-list assertion on the problem keys, and the
completion service's batching, idempotency and input validation.

### 6.7 Phase 2 compatibility concerns

1. **The submission flow still does not record completions.** Until Phase 3
   wires it, a student's `completed` flag stays `false` even after an
   `ACCEPTED` submission. This is deliberate — global problem history is kept
   strictly separate from assignment completion — but it is the main
   behavioural gap.
2. **Unpublished problems cannot be assigned.** Requiring `PUBLISHED` means a
   trainer must publish before assigning. DRAFT-first workflows will hit a
   `400`; this is intentional to avoid assignments students cannot open.
3. **Date-less assignments still collide.** Two `POST`s for the same problem and
   batch without `availableFrom` return `409` (`null` is a valid index key).
   Clients must pass an explicit `availableFrom` to assign the same problem twice.
4. **`Assignment.status` is still never auto-derived.** Trainer monitoring uses
   per-student `AssignmentCompletion` counts, not `status`.
5. **Open findings from section 5 remain open** — the `PARTIAL` verdict that does
   not exist in `Submission.verdict`, and the `acceptedSubmission` field being
   required even for `WRONG_ANSWER`. These now affect the service API, so decide
   them before Phase 3 wires automatic recording.
6. **`monitoring.pending` counts active enrollments**, so a student enrolled
   after some completions will appear pending. This is the intended reading of
   "how many are still pending" but it is not a time-relative measure.

---

## 7. Phase 3 – Submission → Assignment Completion (IMPLEMENTED)

A persisted `ACCEPTED` student submission now records an `AssignmentCompletion`
for every matching `(assignment, student)` pair.

### 7.1 Verdict / model decisions

**`Submission.verdict` (inspected, not guessed)** is exactly:
`ACCEPTED`, `WRONG_ANSWER`, `COMPILATION_ERROR`, `RUNTIME_ERROR`,
`TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED`, `EXECUTION_ERROR`.

**`AssignmentCompletion.verdict` mismatch resolved.** The enum was
`['ACCEPTED', 'PARTIAL', 'WRONG_ANSWER']`. A codebase-wide search showed
`PARTIAL` existed **only** in this enum — no code path produced or consumed it,
so it was an invented verdict. It has been removed. The enum is now
`['ACCEPTED', 'WRONG_ANSWER']`:

- a strict subset of the real `Submission.verdict` enum, so the two can never disagree;
- nothing was invented;
- `ACCEPTED` and `WRONG_ANSWER` are both real submission verdicts, so existing
  legitimate semantics are preserved.

The automatic path only ever writes `ACCEPTED`, taken from the submission
itself (`verdict: submission.verdict`) rather than a caller-supplied constant.

**`acceptedSubmission` validation.** This is a cross-document invariant, so it
cannot be expressed as Mongoose field validation; it is enforced in the service,
which is the only writer of the collection. A completion may only reference a
submission that is (a) persisted, (b) `ACCEPTED`, (c) owned by the
authenticated student, and (d) for the same problem as the assignment. The
problem is read back **from the submission** rather than trusted from the
caller, so a caller cannot point a completion at an unrelated problem. A
`problemId` may optionally be passed as a cross-check; a disagreement is
rejected with `PROBLEM_MISMATCH`.

### 7.2 Service contract — `backend/src/services/assignmentCompletion.js`

```js
recordAssignmentCompletion({ studentId, submissionId, problemId?, now? })
  => { recorded, skipped, matched, reason, submission }
```

`studentId` is the authenticated `req.user.id`, matching the project convention
(`BatchStudent.student` and `Submission.student` are both the authenticated
`User` ID). `problemId` is derived from the submission, not from the caller.

Domain-level rejections return a structured `reason` instead of throwing, so a
rejection can never escalate into a submission failure:

| `reason` | Condition |
| --- | --- |
| `SUBMISSION_NOT_FOUND` | the submission id does not resolve to a document |
| `SUBMISSION_NOT_ACCEPTED` | `submission.verdict !== 'ACCEPTED'` |
| `SUBMISSION_STUDENT_MISMATCH` | `submission.student !== studentId` |
| `PROBLEM_MISMATCH` | an explicit `problemId` disagrees with the submission |
| `NO_ENROLLMENT` | the student has no `ACTIVE` `BatchStudent` enrollment |
| `NO_COMPLETABLE_ASSIGNMENTS` | no ACTIVE, non-deleted, available assignment in an enrolled batch |

Malformed ids are a programmer error and still throw with `.status = 400`.

Assignments are matched on `problem` + `batch ∈ active enrollments` +
`status: 'ACTIVE'` + `deleted: false` + `availableFrom: null or <= now`.
Writing uses `findOneAndUpdate` with `$setOnInsert` and `upsert`, so the unique
`(assignment, student)` index makes repeated processing a no-op that preserves
the first `acceptedSubmission` and `completedAt`. A concurrent `11000` is
reported in `skipped` rather than thrown. `TestCase` is never queried, so
hidden expected outputs cannot leak.

### 7.3 Submission integration point

`backend/src/routes/student/submissions.js`, **immediately after**
`Submission.create({...})` (line 126) — the submission is persisted and
`overallVerdict` is final:

```js
if (overallVerdict === 'ACCEPTED') {
  try {
    await recordAssignmentCompletion({
      studentId: req.user.id,
      submissionId: submission._id,
    });
  } catch (completionError) {
    logger.warn('Assignment completion recording failed', {
      event: 'assignment.completion.record_failed',
      requestId: req.requestId,
      studentId: req.user.id,
      problemId,
      submissionId: submission._id.toString(),
      message: completionError.message,
    });
  }
}
```

Only the completion call is inside the `try`. Code execution, verdict mapping,
submission persistence, compiler-key bookkeeping and the response construction
are all untouched, and no error from those paths is swallowed. Logging uses
`src/config/logger.js` with the project's structured `{ event, requestId, ... }`
shape; the logger redacts `code`, so no student source is logged.

Verified unchanged: HTTP status, `body.success`, `data.id`, `data.verdict`,
`data.testResults` (keys `testCase`, `passed`, `output`, `error`), the GET list
payload (`-code -executionResult -testResults`), and the GET detail payload.

### 7.4 Test commands and exact results

```
npm test -- --runInBand tests/assignmentCompletionIntegration.test.js
  Test Suites: 1 passed, 1 total
  Tests:       11 passed, 11 total

npm test -- --runInBand tests/assignment.test.js tests/assignmentCompletion.test.js \
  tests/assignmentCompletionIntegration.test.js tests/trainerAssignments.test.js \
  tests/studentAssignments.test.js tests/studentSubmissions.test.js
  Test Suites: 6 passed, 6 total
  Tests:       127 passed, 127 total

npm test -- --runInBand tests/studentProblems.test.js tests/studentProblemRun.test.js \
  tests/studentLeaderboard.test.js tests/studentDashboard.test.js tests/studentConsole.test.js
  Test Suites: 5 passed, 5 total
  Tests:       51 passed, 51 total
```

**11 suites / 178 tests passing, 0 failures.** The full backend suite was
intentionally not run.

`tests/assignmentCompletionIntegration.test.js` (11 tests) maps to the required
list: ACCEPTED completes the correct assignment; WRONG_ANSWER does not;
COMPILATION_ERROR does not; two batch assignments of the same problem complete
independently; a student cannot complete another student's assignment (even in
the same batch, where submission access is identical); an unenrolled student and
an `INACTIVE` enrollment cannot complete; cancelled / deleted / future
assignments are not completed; repeated processing plus a second accepted
submission creates no duplicates and preserves the first submission; a forced
service failure still returns the unchanged 201 with the submission persisted and
nothing completed; submission response and history contracts are asserted key by
key.

### 7.5 Remaining issues and compatibility concerns

1. **Student output for hidden cases is returned (by design, verified).** The
   submission response includes `output` = the *student's own* stdout for every
   test case, including hidden ones. That is the existing, unchanged behaviour
   and is not an expected-output leak. A meaningful "hidden expected output is
   not exposed" assertion can only be made when the two values differ, so the
   tests assert it during a `WRONG_ANSWER` run and assert the guarantee
   structurally (no `expectedOutput` key in the response) on a passing run.
2. **`WRONG_ANSWER` remains a legal completion verdict.** It is a real
   submission verdict and was preserved, but nothing writes it: a completion is
   only recorded for an `ACCEPTED` submission. If trainers are meant to record
   partial credit, that needs an explicit endpoint — currently there is none.
3. **`acceptedSubmission` is still `required` on the model**, so a manually
   inserted completion must also point at a real submission. Only the service
   writes this collection; consider marking it as service-owned.
4. **Completion is not back-filled.** Students who solved an assignment before
   this phase have a stored `ACCEPTED` submission but no completion record. A
   one-off back-fill would need a decision on whether `completedAt` is the
   submission's or the back-fill's timestamp.
5. **Unresolved from earlier phases:** `Assignment.status` is still never
   auto-derived; date-less assignments still collide per batch+problem; and
   `Assignment.title` still has no default.
6. **Race window.** The completion is written after the submission is persisted,
   so a crash in between loses the completion. The submission itself is never
   affected. A back-fill or an outbox would close this if it matters.

---

## 8. Phase 4 – Frontend Integration (IMPLEMENTED)

### 8.1 Files created / modified

**Created**
| File | Purpose |
| --- | --- |
| `frontend/src/pages/trainer/Assignments.jsx` | Trainer assignment management (batch picker + per-batch list, create, edit, soft delete) |
| `frontend/src/pages/trainer/Assignments.test.jsx` | 16 tests |
| `frontend/src/pages/student/AssignmentFeed.jsx` | Student assignment feed (Pending / Completed) |
| `frontend/src/pages/student/AssignmentFeed.test.jsx` | 11 tests |
| `frontend/src/styles/pages/trainer-assignments.css` | Trainer styles, built only from existing tokens |
| `frontend/src/styles/pages/student-assignments.css` | Student styles, built only from existing `--student-*` tokens |

**Modified**
| File | Change |
| --- | --- |
| `frontend/src/api/trainer.js` | +6 assignment functions |
| `frontend/src/api/student.js` | +2 assignment functions |
| `frontend/src/routes/AppRoutes.jsx` | +1 import, +2 routes (`/trainer/assignments`, `/trainer/batches/:batchId/assignments`) |
| `frontend/src/navigationConfig.js` | +1 TRAINER nav item "Assignments" |
| `frontend/src/components/ui/Icon.jsx` | +1 mapping `checkSquare` → `SquareCheck` (no new dependency) |
| `frontend/src/pages/trainer/BatchDetails.jsx` | +1 module-nav link, +1 gateway card |
| `frontend/src/pages/student/DailyTraining.jsx` | +1 import, renders `<AssignmentFeed />` above the Training grid |
| `backend/src/routes/trainer/assignments.js` | **+1 read-only gap-fill endpoint** (see 8.3) |
| `backend/tests/trainerAssignments.test.js` | +3 tests for that endpoint |

No existing component, route, API client or CSS file was rewritten.

### 8.2 API-client functions and routes used

`frontend/src/api/trainer.js`:
```js
getBatchAssignments(batchId, params)   // GET  /trainer/batches/:batchId/assignments?includeDeleted=
getBatchAssignment(batchId, id)        // GET  /trainer/batches/:batchId/assignments/:id
getAssignableProblems(batchId)         // GET  /trainer/batches/:batchId/assignments/problems
createAssignment(batchId, data)        // POST /trainer/batches/:batchId/assignments
updateAssignment(batchId, id, data)    // PATCH /trainer/batches/:batchId/assignments/:id
deleteAssignment(batchId, id)          // DELETE /trainer/batches/:batchId/assignments/:id
```
`frontend/src/api/student.js`:
```js
getStudentAssignments()                // GET /student/assignments
getStudentAssignment(id)               // GET /student/assignments/:id
```
All go through the existing `api/client.js` axios instance, so the Bearer token
interceptor and the 401 → refresh → redirect flow are unchanged.

The create/edit payloads use only `problemId`, `title`, `availableFrom`,
`status`. **No `dueDate` control exists anywhere**, matching the API.

### 8.3 Backend gap-fill (one additive read-only endpoint)

`GET /api/trainer/batches/:batchId/assignments/problems` was added because no
existing trainer route could list GLOBAL problems —
`GET /api/trainer/batches/:batchId/problems` returns only that batch's problems,
and the global-problem routes are ADMIN-only. Without it the requirement "GLOBAL
problems may be selected" was unsatisfiable from the UI.

It mirrors `assertProblemAssignable` exactly (`requireAuth`,
`requireRole('TRAINER')`, `assertTrainerOwnsBatch`, then `status: 'PUBLISHED'`
and `scope: GLOBAL` **or** `scope: BATCH, batch: batchId, createdBy: trainer`)
and returns the same light `problemPayload` the assignment routes already use.
It is registered before `/:assignmentId` so the literal path is not read as an id.
No existing route, model or service was modified.

### 8.4 Trainer workflow

1. **Sidebar → Assignments** (`/trainer/assignments`) shows only the batches the
   API returns for that trainer. Empty state when there are none; error state with
   Retry. Selecting a batch navigates to the scoped page.
2. **Scoped page** (`/trainer/batches/:batchId/assignments`, also linked from the
   batch module nav and a new gateway card) lists that batch's assignments with
   status badge, problem scope, difficulty, availability label
   (`Available now` / `Available <date>`) and, only when the API supplies a
   usable denominator, a progress bar with
   `N completed · M pending · K enrolled · P%`.
3. **Create** opens a modal with a problem `<select>` populated *only* from
   `getAssignableProblems`. Problems already assigned for the currently selected
   `availableFrom` date are filtered out of the dropdown. Title, optional
   `availableFrom` and status are editable. Submit is disabled until a problem is
   chosen and while the request is in flight (no duplicate submissions).
4. **409** from the unique `(batch, problem, availableFrom)` index renders
   *"This problem is already assigned to this batch for that date."*; any other
   error renders the API message.
5. **Edit** sends only `title`, `availableFrom`, `status`.
6. **Remove** opens a confirmation modal explaining the record is retained, then
   calls the soft-delete endpoint and refreshes the list.
7. Batch creation and enrollment were deliberately **not** added here.

### 8.5 Student workflow

`AssignmentFeed` renders inside `DailyTraining` (i.e. `/student/batch`), above the
existing Training grid:

- Groups assignments into **Pending** and **Completed** using the server's
  `completed` flag.
- Shows the assignment title (falling back to the problem title), batch name and
  code, availability, and the completion date from `completion.completedAt`.
- **Start** (pending) / **Review** (completed) navigates to the existing solving
  route `/student/problems/:problemId`. No second code editor was built.
- Data is refetched on mount and on `window` focus — the same pattern
  `DailyTraining` already uses — so a just-accepted submission is reflected on
  return. A focused test covers this.
- Loading, empty and error states each have their own treatment; Retry refetches.
- `completed` is **never** set locally. Clicking Start does not complete
  anything, and a wrong answer cannot complete anything — both are asserted.

### 8.6 Test and build commands — exact results

```
cd frontend
npx vitest run src/pages/trainer/Assignments.test.jsx src/pages/student/AssignmentFeed.test.jsx
  Test Files  2 passed (2)
  Tests       27 passed (27)

npx vitest run                 # whole frontend suite
  Test Files  5 passed (5)
  Tests       37 passed (37)

npm run build
  ✓ 2116 modules transformed.
  dist/assets/index-CvVvBk_Y.css   259.93 kB │ gzip:  39.16 kB
  dist/assets/index-D2_qLM4m.js  1,487.41 kB │ gzip: 364.95 kB
  ✓ built in 3.60s
```
Backend (assignment + submission only, for the gap-fill endpoint):
```
npm test -- --runInBand tests/assignmentCompletionIntegration.test.js \
  tests/studentAssignments.test.js tests/assignmentCompletion.test.js \
  tests/trainerAssignments.test.js tests/studentSubmissions.test.js
  Test Suites: 5 passed, 5 total
  Tests:       112 passed, 112 total
```
Frontend lint was **not** run, per instructions. The build's chunk-size warning
is pre-existing (Monaco editor) and unrelated to this phase.

### 8.7 Remaining limitations

1. **Batch name is fetched separately.** The assignment payloads carry only a
   raw `batch` ObjectId, so the trainer page issues a second `getTrainerBatches()`
   call purely to render the header name. Harmless but avoidable by populating
   `batch: 'name code'` on the trainer assignment payload.
2. **The client-side duplicate filter is date-scoped.** Problems already
   assigned for the *selected* date are hidden from the dropdown; switching the
   date re-computes the list. The backend remains the authority — this is only a
   convenience, and the 409 path is still handled.
3. **No assignment re-ordering, bulk assignment, or per-student drill-down.** The
   monitoring data is aggregate only (completed/pending counts).
4. **`WRONG_ANSWER` completions have no UI and no writer**, as in Phase 3.
5. **No back-fill** of completions for submissions accepted before Phase 3, so old
   work still shows as Pending.
6. **The student feed is not on the Student Dashboard**, only on `/student/batch`.
   A student with no batch never sees it (the API returns an empty list for them
   anyway). Putting it on the dashboard would duplicate the section.
7. **Assignment data is not invalidated on in-tab submission.** Refreshing
   depends on the window-focus listener, matching the existing `DailyTraining`
   behaviour. A shared event bus would be tighter but is a wider change.
8. **JSON bulk import and advanced analytics remain out of scope.**

---

## 9. Recommended Next Step (Phase 5)

- Populate `batch: 'name code'` on the trainer assignment payload to remove the
  extra round-trip.
- Add per-student drill-down on a trainer assignment (who is pending, and why).
- Decide the `WRONG_ANSWER` completion path, or drop it from the enum.
- Back-fill completions for submissions accepted before Phase 3.
- Batch/bulk assignment creation for trainers.

---

*Phase 1 verified: 18/18 + 17/17 model tests. Phase 2 verified: 30/30 + 20/20 API
tests. Phase 3 verified: 11/11 integration tests. Phase 4 verified: 27/27 new
frontend tests, 37/37 full frontend suite, production build succeeds, 112/112
relevant backend tests.*