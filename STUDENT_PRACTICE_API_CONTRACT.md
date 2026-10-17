# Student Practice API Contract

## 1. Data flow

`Student -> active BatchStudent enrollment -> Batch -> batch-scoped Problem`.
Global problems are independent of enrollment. Both kinds of problems are linked to the hierarchy through `ProblemTopic`:

`Collection -> Topic -> ProblemTopic -> Problem -> Submission(student, problem)`.

There is no separate daily-assignment model. Trainer assignment creates a `Problem` with `scope: 'BATCH'`, the target `batch`, and an optional `practiceDate`.

## 2. Global Practice source

The authoritative source is `Problem.scope === 'GLOBAL'`, with `Problem.status === 'PUBLISHED'`. `practiceDate` is ignored for global visibility. Global problems can be linked to collections/topics through `ProblemTopic`.

## 3. Daily Practice source and assignment

The authoritative daily source is `Problem.scope === 'BATCH'`, `Problem.batch`, and `Problem.practiceDate`. Trainer creation is `POST /api/trainer/batches/:batchId/problems`; the trainer-owned batch is enforced by `assertTrainerOwnsBatch`. The assignment date is stored directly as `Problem.practiceDate` (`Date`). A null date is retained as a backward-compatible undated batch problem.

## 4. Applicability and date rules

- A student without an active `BatchStudent` enrollment sees published Global problems only.
- A student with an active enrollment sees published Global problems plus published BATCH problems whose `batch` matches an active enrollment.
- A dated BATCH problem is visible only when its `practiceDate` is before the end of the current application day in IST. This includes today and all past dates; future dates are excluded.
- An undated BATCH problem remains visible for enrolled students for backward compatibility.
- Global problems are never date-filtered.
- Archived, draft, or otherwise non-published problems are excluded.
- Access to a single problem uses the same rules, so future or unrelated batch problems return 404.

The shared source for this behavior is `backend/src/services/problemAccess.js` (`visibleProblemQuery` and `canStudentAccessProblem`).

## 5. Progress

`Submission` is authoritative:

- `NOT_STARTED`: no submission exists for the student/problem.
- `ATTEMPTED`: at least one submission exists and none considered by the endpoint is accepted.
- `SOLVED`: an `ACCEPTED` submission exists. Solved takes precedence over attempted.

Opening a problem is read-only and does not create a submission. Actual submission creation occurs in `POST /api/student/submissions`; execution/run endpoints do not persist submissions. Collection/topic totals use the visible problem set, and solved counts use accepted submissions.

## 6. Exact student endpoints

### `GET /api/student/collections`

Auth: authenticated `STUDENT`. No parameters. Returns active collections with applicable `topicCount`, `problemCount`, `completedProblemCount`, `progressPercentage`, and `trainingStatus`.

### `GET /api/student/collections/:id/topics`

Auth: authenticated `STUDENT`. Path parameter `id` is a collection ObjectId. Returns active topics in the collection with applicable problem counts and solved progress. Problems are filtered by publication, enrollment, and daily date rules.

### `GET /api/student/topics/:topicId`

Auth: authenticated `STUDENT`. Path parameter `topicId` is a topic ObjectId. Returns topic metadata, collection metadata, and an applicable `problemCount`.

### `GET /api/student/topics/:topicId/problems`

Auth: authenticated `STUDENT`. Path parameter `topicId`; optional query `page` and `limit`. Returns applicable published problems ordered by creation date, with `id`, `title`, `slug`, `difficulty`, `status`, and `progress`. Response also includes `{ total, page, limit }`.

### `GET /api/student/problems`

Auth: authenticated `STUDENT`. No parameters. Returns all applicable published problems with progress and scope metadata. `meta.global` contains Global problems; `meta.today` contains currently visible dated BATCH problems scheduled for the current IST day; past dated BATCH problems remain in `data` but are not categorized in `today`; `meta.upcoming` is now always empty because future daily practice is not exposed. `meta.enrolled` reflects active enrollment.

### `GET /api/student/problems/:problemId`

Auth: authenticated `STUDENT`. Returns problem details only when the problem is published and applicable to the authenticated student. It includes `scope`, batch metadata, `practiceDate`, and current progress.

### `GET /api/student/practice/next`

Auth: authenticated `STUDENT`. Optional query `collectionId`. Returns the next unsolved applicable problem, prioritizing attempted over not-started. Future daily problems are excluded.

## 7. Authorization

All student routes require authentication and the STUDENT role. Student identity comes from `req.user.id`; clients cannot select another student. BATCH visibility requires an active `BatchStudent` record for the problem's batch. Thus another batch's private practice and future practice cannot be requested through hierarchy or detail routes.

## 8. Timezone

The existing application convention is fixed IST (`Asia/Kolkata`, UTC+05:30), implemented with explicit day-bound calculations in `problemAccess.js` and the existing problems route. No new timezone architecture was introduced.

## 9. Backend changes in Phase 2

- Added shared IST date visibility/query helpers to `backend/src/services/problemAccess.js`.
- Applied the shared visibility rule to collection, topic, next-practice, and all-problems student endpoints.
- Applied the same rule to single-problem access.
- Made topic detail `problemCount` applicable to the authenticated student.
- Updated the scheduling test to prove future daily practice is not exposed.
- No execution, submission persistence, compiler, admin, trainer UI, authentication, or shell behavior was changed.

## 10. Tests

Existing focused tests cover authentication, Global visibility without a batch, active-batch visibility, cross-batch isolation, published-status filtering, progress states, IST categorization, legacy undated batch compatibility, and Global date independence. The updated scheduling test additionally proves future dated BATCH problems are absent from `GET /api/student/problems`.

Run from `backend`:

```text
npm test -- --runInBand
```
