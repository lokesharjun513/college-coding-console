# Trainer Module — JSX Refactoring Audit (Phase 0)

**Date:** 2026-10-13
**Scope:** `frontend/src/pages/trainer/**`, trainer routes/navigation, `frontend/src/api/trainer.js`, trainer CSS, trainer tests, and the backend `/api/trainer/*` authorization surface.
**Reference standard:** the completed Admin module (`frontend/src/pages/admin/**` + `frontend/src/styles/pages/admin*.css`).
**Method:** read-only static audit. No files were modified, created, staged, committed or pushed other than this document. No frontend lint was run. No dev server was started, stopped or restarted. No backend test suite was executed.

---

## 0. Constraints observed

| Rule | Status |
|---|---|
| Audit only; no source modification | Honoured — this document is the only file created |
| No Git worktrees; work in existing directory | Honoured |
| Do not stop/restart frontend or backend | Honoured — no process was touched |
| Do not run frontend lint | Honoured |
| Do not change backend APIs or business logic | Honoured |
| Do not assume a feature is missing before checking routes/components/API | Honoured — every claim below is traced to a route, a component or an API function |
| Reuse existing components and tokens | Recommended throughout §7 |
| Do not invent functionality/metrics unsupported by APIs | Honoured — §C.3 lists phantom metrics the UI renders but no API supplies |
| Preserve unrelated working-tree changes | Honoured — pre-existing modified/deleted/untracked files were left untouched (see §0.1) |

### 0.1 Pre-existing working-tree state (observed, untouched)

`git status` already showed modified/deleted/untracked files before this audit began (e.g. deleted `docs/TRAINER_*.md`, untracked root-level `*_REPORT.md`, modified `backend/src/security/dependencyIntegrity.test.js`). None were reset, stashed, discarded or staged.

---

## A. Routes and Navigation

### A.1 Actual Trainer routes

Source of truth: `frontend/src/routes/AppRoutes.jsx:91-133`.

Trainer routes are nested under `/trainer/*` → `ProtectedRoute` → `RoleRoute allowedRoles={['TRAINER']}` → `TrainerLayout` → `SaasLayout`.

| # | Route | Component | File | Status |
|---|---|---|---|---|
| 1 | `/trainer` (index) | `TrainerDashboard` | `pages/trainer/Index.jsx` | Registered |
| 2 | `/trainer/training` | `TrainingManagement` | `pages/trainer/TrainingManagement.jsx` | Registered |
| 3 | `/trainer/analytics` | `Analytics` | `pages/trainer/Analytics.jsx` | Registered |
| 4 | `/trainer/monitoring` | `Monitoring` | `pages/trainer/Monitoring.jsx` | Registered |
| 5 | `/trainer/batches` | `BatchesList` | `pages/trainer/BatchesList.jsx` | Registered |
| 6 | `/trainer/assignments` | `Assignments` | `pages/trainer/Assignments.jsx` | Registered (picker mode) |
| 7 | `/trainer/batches/:batchId/assignments` | `Assignments` | same file | Registered (scoped mode) |
| 8 | `/trainer/problems` | `TrainerProblems` | `pages/trainer/TrainerProblems.jsx` | Registered |
| 9 | `/trainer/students` | `TrainerStudents` | `pages/trainer/Students.jsx` | Registered |
| 10 | `/trainer/batches/:batchId/students` | `TrainerBatchStudentsList` | `pages/trainer/BatchStudentsList.jsx` | Registered |
| 11 | `/trainer/batches/:batchId/students/:studentId/performance` | `StudentPerformance` | `pages/trainer/Performance/StudentPerformance.jsx` | Registered |
| 12 | `/trainer/batches/:batchId` | `BatchDetails` | `pages/trainer/BatchDetails.jsx` | Registered |
| 13 | `/trainer/batches/:batchId/performance` | `BatchPerformance` | `pages/trainer/Performance/BatchPerformance.jsx` | Registered |
| 14 | `/trainer/batches/:batchId/problems` | `ProblemsList` | `pages/trainer/ProblemsList.jsx` | Registered |
| 15 | `/trainer/batches/:batchId/problems/create` | `ProblemEditor` | `pages/trainer/ProblemEditor.jsx` | Registered (create) |
| 16 | `/trainer/batches/:batchId/problems/:problemId` | `ProblemDetails` | `pages/trainer/ProblemDetails.jsx` | Registered |
| 17 | `/trainer/batches/:batchId/problems/:problemId/performance` | `ProblemPerformance` | `pages/trainer/Performance/ProblemPerformance.jsx` | Registered |
| 18 | `/trainer/batches/:batchId/problems/:problemId/testcases` | `TestCasesList` | `pages/trainer/TestCasesList.jsx` | Registered |
| 19 | `/trainer/batches/:batchId/problems/:problemId/edit` | `ProblemEditor` | same file | Registered (edit) |
| 20 | `/trainer/batches/:batchId/students/:studentId` | `EnrollmentDetails` | `pages/trainer/EnrollmentDetails.jsx` | Registered |
| 21 | `/trainer/profile` | `TrainerProfile` | `pages/trainer/TrainerProfile.jsx` | Registered **outside** the layout (own `SaasLayout`) |

`AppRoutes.jsx:181` catch-all `*` → `/login`.

**21 Trainer routes, 19 distinct page components.**

### A.2 Navigation config

`frontend/src/navigationConfig.js:33-63` defines the TRAINER sidebar:

| Group | Items |
|---|---|
| Main | Dashboard `/trainer`; Training `/trainer/training` |
| Management | Batches `/trainer/batches`; Assignments `/trainer/assignments`; Students `/trainer/students`; Problems `/trainer/problems` |
| Analytics | Performance `/trainer/performance`; Monitoring `/trainer/monitoring`; Analytics `/trainer/analytics` |
| System | *(empty)* |

### A.3 Navigation defects (verified)

1. **`/trainer/performance` has no route.** `navigationConfig.js:53` links to it; `AppRoutes.jsx` defines no such path (only `/trainer/batches/:batchId/performance` at `:113`). Clicking it hits the catch-all at `AppRoutes.jsx:181` and **redirects the trainer to `/login`** — an effective logout. This is a top-level sidebar item and the single highest-impact navigation bug.
2. **`/trainer/problems/create` has no route.** `pages/trainer/Index.jsx:173` — the Dashboard's *primary* Quick Action ("Create Problem") — navigates to a non-existent path and therefore redirects to `/login`. The real create route is `/trainer/batches/:batchId/problems/create` (`AppRoutes.jsx:115`).
3. **No sidebar entry for Profile.** `/trainer/profile` (`AppRoutes.jsx:126`) is reachable only by direct URL; it is absent from `navigationConfig.js`. The `System` group is present but empty (`:59-62`) — dead scaffolding.
4. **Empty `System` group** renders as a stray section label for all Trainer users.
5. **Icon coverage gaps.** `navigationConfig.js` references `trendingUp` (`:38`), `checkSquare` (`:45`), `chartBar` (`:54-55`), `fileCode` (`:47`), all present in `components/ui/Icon.jsx`. But `Index.jsx` renders `Icon name="upload"` (`:189`) and `Icon name="book"` (via `TrainingManagement.jsx:381`), `Icon name="clipboard"` (`:313`) — **none of which are in `Icon.jsx`'s `iconMap`**, so they silently render `null`.
6. **Batch-scoped sub-navigation is inconsistent.** `BatchDetails.jsx:89-98` builds an 8-item module nav where `monitoring` and `leaderboard` are hard-coded `{ unavailable: true }` and render as inert "Upcoming" spans, while a real `/trainer/monitoring` route exists.
7. **`Sidebar` renders role config generically** — no Trainer-specific grouping or "upcoming" affordance exists to carry items 3/4.

### A.4 Route guards

- `routes/ProtectedRoute.jsx` — JWT presence via `AuthContext`; redirects to `/login` when unauthenticated.
- `routes/RoleRoute.jsx` — exact role match against `allowedRoles`; redirects to the role's home on mismatch.
- **All 21 Trainer routes sit behind `RoleRoute allowedRoles={['TRAINER']}`** (`AppRoutes.jsx:95, :128`). Frontend guard is correct and matches the backend's exact-match `requireRole` semantics (`backend/src/middleware/role.js:15`).

---

## B. JSX File Inventory

21 files, **~4,702 physical lines**.

### B.1 Complexity scoring

Complexity = lines × (distinct concerns). `Low` = single fetch + presentational. `Medium` = multiple fetches or modal/CRUD state. `High` = multiple concerns + N+1 fan-out + duplicated logic.

| File | Lines | Route | Main responsibilities | Complexity |
|---|---|---|---|---|
| `Index.jsx` | 415 | `/trainer` | KPI grid, batch switcher, Quick Actions, My Batches table, Recent Submissions table, leaderboard preview | **High** |
| `Assignments.jsx` | 556 | `/trainer/assignments`, `…/:batchId/assignments` | Batch picker OR scoped CRUD list; create/edit/soft-delete modals; completion % | **High** (best-tested) |
| `TrainingManagement.jsx` | 526 | `/trainer/training` | Batch selector, daily-problem CRUD, collections grid, progress grid, 2 modals | **High** |
| `Monitoring.jsx` | 364 | `/trainer/monitoring` | 4-level cascade filters, KPI grid, leaderboard table, per-student detail panel | **High** |
| `Students.jsx` | 384 | `/trainer/students` | Enrollment list, search, summary strip, manual-card/`DataTable` switch, Add-Student modal | **High** |
| `ProblemsList.jsx` | 414 | `…/problems` | Problem list, search+filters, archive, bulk JSON import modal, template download | **High** |
| `BatchStudentsList.jsx` | 300 | `…/students` | Enrollment table, bulk select/unenroll, enroll modal with debounced search | **Medium** |
| `BatchDetails.jsx` | 269 | `…/:batchId` | Breadcrumb, summary, module nav, gateway cards, performance snapshot | **Medium** |
| `Analytics.jsx` | 242 | `/trainer/analytics` | Cascade filters, KPI grid, leaderboard table | **Medium** |
| `ProblemEditor.jsx` | 236 | `…/problems/create`, `…/edit` | Create/update form, collection→topic cascade | **Medium** (zero styling) |
| `BatchesList.jsx` | 214 | `/trainer/batches` | Card grid, search, summary strip, skeletons, retry | **Low–Medium** |
| `TrainerProblems.jsx` | 101 | `/trainer/problems` | N+1 fan-out over batches, flat problem table | **Low** (zero styling) |
| `TestCasesList.jsx` | 103 | `…/testcases` | Test-case list + add form + delete | **Low** (zero styling) |
| `ProblemDetails.jsx` | 42 | `…/problems/:problemId` | Read-only problem view | **Low** (zero styling) |
| `EnrollmentDetails.jsx` | 61 | `…/students/:studentId` | Enrollment view + status toggle | **Low** (zero styling) |
| `Performance/BatchPerformance.jsx` | 66 | `…/:batchId/performance` | 6 metric tiles | **Low** (zero styling) |
| `Performance/StudentPerformance.jsx` | 62 | `…/students/:id/performance` | 5 metric tiles | **Low** (zero styling) |
| `Performance/ProblemPerformance.jsx` | 74 | `…/problems/:id/performance` | 2 metrics + attempts table | **Low** (zero styling) |
| `TrainerProfile.jsx` | 30 | `/trainer/profile` | Name/email/role/status + logout | **Low** |
| `TrainerLayout.jsx` | 14 | `/trainer/*` | `SaasLayout` + `Outlet` | **Low** |
| `components/BulkImportModal.jsx` | 229 | *(orphan)* | Bulk import — **not imported by any file** | **Dead** |

### B.2 Reusable components already used

| Shared component | Trainer consumers |
|---|---|
| `ui/Button` | BatchesList, BatchDetails, BatchStudentsList, Students, ProblemsList, Assignments, TrainingManagement, TrainerProfile |
| `ui/Badge` | Students, BatchStudentsList, TrainingManagement, Analytics, Monitoring |
| `ui/Avatar` | Students, BatchStudentsList |
| `ui/Spinner` | Index, BatchDetails, BatchStudentsList, ProblemsList, Assignments, TrainingManagement, Analytics, Monitoring, ProblemEditor, ProblemDetails, TestCasesList, EnrollmentDetails, Performance/* |
| `ui/Card` | Students, TrainerProfile |
| `ui/PageHeader` | Students, Analytics, Monitoring |
| `ui/Modal` | Students, BatchStudentsList, ProblemsList, Assignments, TrainingManagement |
| `ui/DataTable` | Students |
| `ui/EmptyState` | Students, Analytics, Monitoring |
| `ui/Icon` | Index, BatchesList, BatchDetails, BatchStudentsList (partial), Students, TrainingManagement |

**Unused by Trainer:** `ui/Input`, `ui/Progress`, `ui/Skeleton`, `ui/IconButton`, `ui/Tooltip`, `ui/Toast`/`toast/ToastProvider`, `reports/StatCardWithTrend`, `reports/DateRangeSelector`, `common/Sparkline`. Several are direct substitutes for hand-rolled Trainer markup.

### B.3 Duplicate JSX and repeated logic

**Duplicate local helpers (near-identical, defined independently):**

| Helper | Duplicated in |
|---|---|
| `statusClass(status)` → `active`/`completed`/`neutral` | `BatchesList.jsx:9`, `BatchDetails.jsx:10`, `Assignments.jsx:18` |
| `statusBadgeVariant(s)` → success/info/neutral/warning | `Analytics.jsx:108`, `Monitoring.jsx:148` |
| Batch-selector `<select>` over `getTrainerBatches()` | `Index.jsx:102`, `Analytics.jsx:130`, `Monitoring.jsx:176`, `TrainingManagement.jsx:235`, `Assignments.jsx:130-315` |
| Collection→topic cascade fetch | `ProblemEditor.jsx:32-53`, `Analytics.jsx:66-82`, `Monitoring.jsx:85-101`, `TrainingManagement.jsx:73-93` |
| Analytics fetch + cancellation flag | `Analytics.jsx:85-103` and `Monitoring.jsx:104-122` — **structurally identical** |
| `fetchData` → `setLoading/setError/try/catch/finally` | 11 of 19 pages |
| Breadcrumb nav markup | `BatchDetails.jsx:103`, `BatchStudentsList.jsx:125`, `ProblemsList.jsx:193`, `Assignments.jsx:253`/`:342`, plus `TrainingManagement.jsx:197` (different class names) |
| Loading/error/empty tri-state shell | `BatchesList.jsx:129-154`, `BatchDetails.jsx:64-85`, `Students.jsx:125-139` |
| KPI/summary tile grid | `Index.jsx:127-161`, `BatchesList.jsx:164-177`, `BatchDetails.jsx:134-151`, `ProblemsList.jsx:215-228`, `Students.jsx:207-224`, `TrainingManagement.jsx:410-451` |
| Problem-list row with edit/view/archive | `ProblemsList.jsx:285-313`, `TrainingManagement.jsx:320-357` |

**The single biggest duplication:** `Analytics.jsx` and `Monitoring.jsx` are the same page. Both load batches, both build the identical 4-level Batch→Training→Day→Status cascade with identical clear-on-parent-change semantics, both call `getTrainerAnalytics` with identical params, both render the identical KPI grid (`Analytics.jsx:186-193` ≈ `Monitoring.jsx:234-241`) and the identical 7-column leaderboard table (`Analytics.jsx:208-235` ≈ `Monitoring.jsx:254-292`). Monitoring then adds a right-hand student-detail panel. The difference is: Monitoring rows are clickable, and Analytics is standalone.

**Second-largest duplication:** `ProblemsList.jsx` and `TrainingManagement.jsx` both implement the same batch-problem list with the same archive-confirmation modal and the same `deleteProblem` call — but TrainingManagement omits the description field required by the backend (`TrainingManagement.jsx:155-159` sends only `title`/`difficulty`/`status` while `ProblemEditor.jsx:94` sends `description` too).

### B.4 Refactoring opportunities (per page)

- **`Index.jsx`** — extract `<KpiGrid>`, `<SectionCard>` (header + icon + "View All"), `<DataTable>`. Replace the hand-rolled tables with `ui/DataTable`. Fix the phantom Recent Submissions section (§C.3). Fix the dead "Create Problem" CTA (§A.3.2). `getTrainerCollections({limit:5})` is fetched and stored in state but **never rendered** (`Index.jsx:19, 32, 34`) — dead fetch.
- **`Assignments.jsx`** — already the highest-quality Trainer page. Extract the breadcrumb + field-row + modal-footer patterns for reuse. Convert `statusClass` to the shared `Badge` component it already imports indirectly.
- **`TrainingManagement.jsx`** — either merge into `ProblemsList`/`Assignments` or rebuild on shared primitives. Remove the 4 phantom metrics (§C.3), the 2 `alert()` calls, and the 11 orphan class names (§D.6).
- **`Monitoring.jsx` / `Analytics.jsx`** — merge into one `ProgressExplorer` page with a `showStudentDetail` flag; or extract `<CascadeFilters>`, `<KpiGrid>`, `<LeaderboardTable>` and have both compose them. This is the highest-value single extraction in the module.
- **`Students.jsx`** — 40 inline styles, undefined CSS class `trainer-students-page`, 3 undefined custom properties, a hand-rolled `window.innerWidth < 768` resize listener instead of CSS, and a duplicate of `BatchStudentsList`'s job. Strong candidate for deletion in favour of `BatchStudentsList` + a cross-batch view.
- **`ProblemEditor.jsx` / `TrainerProblems.jsx` / `TestCasesList.jsx` / `ProblemDetails.jsx` / `EnrollmentDetails.jsx` / `Performance/*`** — completely unstyled; rebuild on `PageHeader`/`Card`/`Button`/`Input`/`DataTable`.
- **`TrainerProfile.jsx`** — near-duplicate of `pages/Profile.jsx` (26 lines, same body minus `status`). Consolidate onto one component.

---

## C. API Integration

### C.1 `frontend/src/api/trainer.js` — 34 exported functions

All use `api` from `./client` (`api/client.js` → `api.js`), which attaches `Authorization: Bearer` and performs 401-refresh-and-retry.

| Group | Functions |
|---|---|
| Batches | `getTrainerBatches`, `getTrainerBatch`, `getBatchStudents`, `getTrainerStudents`, `getAvailableBatchStudents`, `bulkUnenrollStudents`, `bulkEnrollStudents`, `enrollStudent`, `updateStudentEnrollment`, `deleteStudentEnrollment` |
| Problems | `getBatchProblems`, `createProblem`, `getProblem`, `updateProblem`, `deleteProblem`, `bulkImportProblems`, `downloadProblemTemplate` |
| Assignments | `getBatchAssignments`, `getBatchAssignment`, `getAssignableProblems`, `createAssignment`, `updateAssignment`, `deleteAssignment` |
| Test cases | `getTestCases`, `createTestCase`, `getTestCase`, `updateTestCase`, `deleteTestCase` |
| Performance | `getBatchPerformance`, `getStudentPerformance`, `getProblemPerformance` |
| Collections | `getTrainerCollections`, `getTrainerCollectionTopics` |
| Analytics | `getTrainerAnalytics`, `getTrainerStudentDetail` |

**Never called from any page:** `getBatchAssignment` (`:27`), `getTestCase` (`:39`), `updateTestCase` (`:40`), `deleteStudentEnrollment` (`:13`). These are unused API surface, not missing UI.

### C.2 Page → API mapping

| Page | API functions used | Endpoint(s) |
|---|---|---|
| `Index.jsx` | `getTrainerBatches`, `getTrainerAnalytics`, `getTrainerCollections` | `GET /trainer/batches`, `GET /trainer/analytics?batchId`, `GET /trainer/collections?limit=5` |
| `BatchesList.jsx` | `getTrainerBatches` | `GET /trainer/batches` |
| `BatchDetails.jsx` | `getTrainerBatch`, `getBatchPerformance` | `GET /trainer/batches/:id`, `GET /trainer/performance/batch/:batchId` |
| `BatchStudentsList.jsx` | `getTrainerBatch`, `getBatchStudents`, `getAvailableBatchStudents`, `bulkEnrollStudents`, `bulkUnenrollStudents` | 5 endpoints |
| `Students.jsx` | `getTrainerStudents`, `getTrainerBatches`, `enrollStudent` | `GET /trainer/students`, `GET /trainer/batches`, `POST /trainer/batches/:id/students` |
| `ProblemsList.jsx` | `getBatchProblems`, `deleteProblem`, `bulkImportProblems`, `downloadProblemTemplate` | 4 endpoints |
| `ProblemEditor.jsx` | `getProblem`, `createProblem`, `updateProblem`, `getTrainerCollections`, `getTrainerCollectionTopics` | 5 endpoints |
| `ProblemDetails.jsx` | `getProblem` | `GET /trainer/batches/:b/problems/:p` |
| `TestCasesList.jsx` | `getTestCases`, `createTestCase`, `deleteTestCase` | 3 endpoints |
| `TrainerProblems.jsx` | `getTrainerBatches`, `getBatchProblems` (N+1) | fan-out, 1 + N requests |
| `TrainingManagement.jsx` | `getTrainerBatches`, `getTrainerCollections`, `getBatchProblems`, `getBatchPerformance`, `createProblem`, `deleteProblem` | 6 endpoints |
| `Assignments.jsx` | `getTrainerBatches`, `getBatchAssignments`, `getAssignableProblems`, `createAssignment`, `updateAssignment`, `deleteAssignment` | 6 endpoints |
| `Analytics.jsx` | `getTrainerBatches`, `getTrainerCollections`, `getTrainerCollectionTopics`, `getTrainerAnalytics` | 4 endpoints |
| `Monitoring.jsx` | above + `getTrainerStudentDetail` | 5 endpoints |
| `EnrollmentDetails.jsx` | `getBatchStudents`, `updateStudentEnrollment` | 2 endpoints |
| `Performance/*` | `getBatchPerformance`, `getStudentPerformance`, `getProblemPerformance` | 3 endpoints |
| `TrainerProfile.jsx` | *(none — reads `useAuth()`)* | — |

**No API calls are changed by this audit.** No endpoint is missing for any implemented feature; every UI action maps to a real backend route (verified in §E).

### C.3 Hardcoded / placeholder / phantom metrics

| Finding | Location | Evidence |
|---|---|---|
| **`recentSubmissions` does not exist in the analytics API.** `Index.jsx:58-59` reads `analyticsRes.data.data.recentSubmissions`; the backend `GET /api/trainer/analytics` returns only `{ filters, kpis, leaderboard }` (`backend/src/routes/trainer/analytics.js:151-161`). The "Recent Submissions" card (`Index.jsx:293-350`) therefore renders its empty state **permanently**. The source comments at `Index.jsx:57` and `:62` even say "Simulate recent submissions". | `Index.jsx:57-64, 293-350` | Contract mismatch |
| **4 phantom KPI tiles that are always `0`.** `TrainingManagement.jsx:417, 427, 437, 447` render `performance.assigned`, `.attempted`, `.completed`, `.pending`. `GET /trainer/performance/batch/:batchId` returns only `{ batchId, totalStudents, activeStudents, totalProblems, totalSubmissions, solvedProblems, progress }` (`backend/src/routes/trainer/performance.js:46-54`). None of the four fields exist → the entire "Student Progress" section (`TrainingManagement.jsx:403-453`) is a decorative 4×zero grid. | `TrainingManagement.jsx:403-453` | Contract mismatch |
| **`getTrainerCollections` result is fetched and discarded** on the Dashboard. | `Index.jsx:19, 32, 34` | Dead fetch |
| **Dashboard KPI labels claim scope the API does not provide.** "Total Students — *Across all batches*" (`Index.jsx:141-142`) and "Problems Assigned — *Across all batches*" (`Index.jsx:149-150`) are scoped to the **single selected batch**, because `getTrainerAnalytics({ batchId })` (`Index.jsx:53`) is batch-scoped. Only "My Batches" (`Index.jsx:133`) is genuinely trainer-wide. | `Index.jsx:136-159` | Misleading copy |
| **Leaderboard columns on the Dashboard are wrong for the payload.** `Index.jsx:376-404` renders `Problems Solved`, `Avg. Time`, `Accuracy`. The leaderboard rows carry `{ rank, studentId, name, solvedProblems, assignedProblems, completionPercentage, daysCompleted, totalDays, status }` — there is **no `avgTime` and no `accuracy`**, so both columns always render `—` (`Index.jsx:399-400`). | `Index.jsx:376-404` | Unsupported columns |
| **Escaped HTML entity rendered literally.** `BatchesList.jsx:198` — `"You don&apos;t have any batches assigned yet."` is inside a JS **string**, not JSX text, so the browser shows the literal text `You don&apos;t...`. (The other six occurrences — `BatchDetails.jsx:79`, `BatchesList.jsx:148`, `ProblemsList.jsx:318`, `Students.jsx:276`, `TrainingManagement.jsx:514`, `Assignments.jsx:546` — are in JSX and render correctly.) | `BatchesList.jsx:198` | Rendering bug |
| **Hardcoded hex in JSX** | `#16a34a` `ProblemsList.jsx:380, 388`; `#dc2626` `:394`; `#007bff`/`#fff` `ProblemEditor.jsx:225-226`; `#888` `ProblemEditor.jsx:143`; `1px solid #ccc` ×18 across `TrainerProblems`, `TestCasesList`, `ProblemPerformance`, `Performance/*`, `ProblemEditor`; `color:'red'` ×11 | — | Hardcoded palette |
| **No fabricated metrics elsewhere.** `Analytics.jsx` and `Monitoring.jsx` map strictly to real `kpis`/`leaderboard`/`studentDetail` fields. | — | Clean |

### C.4 API performance issues

- **`TrainerProblems.jsx:21-27` performs an N+1 fan-out** — `getTrainerBatches()` then `getBatchProblems(id)` for every batch, unbounded and uncached. A trainer with 12 batches fires 13 sequential-round requests.
- **`Assignments.jsx:131-145` re-fetches the full batch list** just to read one batch name, already available from `getTrainerBatches()` in the picker path.
- **No request cancellation** in `Index.jsx` (`:23-48`), `BatchDetails.jsx` (`:31-62`), `Assignments.jsx` (`:95-145`). `Analytics`/`Monitoring` do use cancellation flags (correctly) — inconsistent.
- **`getAvailableBatchStudents` is broken for every batch.** `trainer/batches.js:171` registers `/:batchId/students/:studentId` *before* `/:batchId/students/available` at `:225`; Express first-match-wins captures `"available"` as `studentId`, fails `isValid` at `:175` and returns **400 'Invalid batch or student id'** before any ownership check. The handlers at `:405` are unreachable dead code. The repo's own test documents this at `backend/tests/trainerUnassignedBatchAccess.test.js:200-209`. **Impact:** the "Enroll Students" modal in `BatchStudentsList.jsx:70` always resolves to an empty list (`available.length === 0` → "No available students found"). This is a **backend routing-order bug**; the frontend refactor cannot fix it and should not try — flag it separately.

---

## D. CSS and Design

### D.1 Token system

| File | Lines | Declares |
|---|---|---|
| `styles/theme.css` | 118 | 61 tokens (`:root`) |
| `styles/tokens.css` | 253 | 148 tokens (`:root`) |
| `styles/global.css` | 66 | imports `tokens.css`; 24 `var()` refs |
| `styles/pages/admin.css` | 1165 nb | 73 `--admin-*` tokens |
| `styles/pages/trainer.css` | 533 nb | 55 `--trainer-*` tokens |

**Required palette — all seven values DO exist as tokens:**

| Value | Where |
|---|---|
| `#FCFDFD` | `theme.css:13` `--color-canvas`, `:14` `--color-surface`, `:43` `--surface-page` |
| `#EDEFF3` | `theme.css:15, 18, 53`; `trainer.css:16` `--trainer-border-light`; `admin.css:70` `--admin-border-light` |
| `#C6D1D7` | `theme.css:17, 52`; `trainer.css:17` `--trainer-border`; `admin.css:71` |
| `#9FA0B5` | `theme.css:20, 28, 54`; `trainer.css:18`; `admin.css:72` |
| `#2F7EDA` | `theme.css:6, 30`; `trainer.css:21` `--trainer-primary`; `admin.css:75, 122` |
| `#555663` | `theme.css:10, 26`; `trainer.css:19`; `admin.css:73` |
| `#0F2441` | `trainer.css:20` `--trainer-text-primary`; `admin.css:74` `--admin-text-primary` |

**`trainer.css:16-21` already mirrors `admin.css:70-75` 1:1.** The palette is available to Trainer CSS today — no new colour system is needed.

### D.2 ⚠️ Critical: two token files collide; `tokens.css` silently wins

`main.jsx:5-6` imports `theme.css` then `global.css`; `global.css:2` `@import`s `tokens.css`. Both are `:root` (equal specificity) and `tokens.css` lands **later**, so it overrides **45 token names**. 15 have visible effect:

| Token | theme.css | tokens.css (wins) | Effective |
|---|---|---|---|
| `--color-canvas` | `#FCFDFD` | `#e0fbfc` | `#e0fbfc` |
| `--color-surface` | `#FCFDFD` | `#c2dfe3` | `#c2dfe3` |
| `--color-muted` | `#9FA0B5` | `#9db4c0` | `#9db4c0` |
| `--color-text-primary` | `#555663` | `#253237` | `#253237` |
| `--color-border` / `--border-default` | `#C6D1D7` | `rgba(37,50,55,.14)` | `rgba(37,50,55,.14)` |
| `--color-success` | `#16a34a` | `#5c6b73` | `#5c6b73` |
| `--font-size-xl` / `-2xl` / `-3xl` | 24/32/40px | 18/20/24px | 18/20/24px |

**Live Trainer breakage caused by this:**
- `Analytics.css:23,64,79` + `Monitoring.css:10` — `var(--color-border, #C6D1D7)` resolves to `rgba(37,50,55,.14)`, **not** `#C6D1D7`. The fallback never fires because the token exists.
- `TrainingManagement.css:47,179` — `var(--color-danger, #B42318)` resolves to `--color-ink` = **`#253237` (black)**. Error text renders black.
- `TrainingManagement.css:22,96,130` — `var(--color-surface, #FCFDFD)` resolves to `#c2dfe3`.
- `trainer-batches.css:220-221` — `__status--active { color: var(--color-success) }` = grey, over `background: var(--color-success-soft)` = green tint → **grey-on-green ACTIVE badge**.

**6 custom properties are referenced but never defined** → the declaration is silently dropped: `--color-surface-secondary` (`components.css:132,153,170,204`), `--radius-pill` (`components.css:180` — so `.badge` gets **no border-radius**), `--bg-surface-muted` (`global.css:70`), `--font-size-body` (`TrainingManagement.css:24`; `Students.jsx:240,258,275,332,361`), `--color-text-tertiary` (`TrainingManagement.css:113,134`), `--color-surface-hover` (`Students.jsx:254`).

**Audit constraint:** resolving these requires changing `tokens.css`/`theme.css` or scoping Trainer tokens explicitly. Both affect Admin. Treat as a separate, Admin-reviewed change — **not** part of the Trainer JSX refactor. The safe Trainer-side move is to consume `admin.css`'s `--admin-*` tokens (which are self-contained) or define `--trainer-*` overrides inside the Trainer stylesheet, never by editing the shared token files.

### D.3 ⚠️ Critical: shared UI components emit `admin-*` classes that Trainer never loads

`PageHeader`, `Modal` and `DataTable` hardcode Admin class names:

| Component | Classes emitted | Defined in |
|---|---|---|
| `components/ui/PageHeader.jsx:21-40` | `admin-page-header`, `admin-breadcrumb`, `admin-page-title`, `admin-page-description`, `admin-page-header-content`, `admin-page-header-text`, `admin-header-actions` | **only** `styles/pages/admin.css` |
| `components/ui/Modal.jsx:75-86` | `admin-modal-overlay`, `admin-modal`, `admin-modal__header`, `admin-modal__title`, `admin-modal__close`, `admin-modal__body`, `admin-modal__footer` | **only** `styles/pages/admin.css:1128-1212` |
| `components/ui/DataTable.jsx:52, 60, 105` | `table-container`, `table admin-table`, `table-header-cell`, `table-cell`, `table-empty-cell` | `components.css` + `components/table.css` for `.table-container`/`.table`; **`.admin-table` only in `admin.css`** |

`styles/pages/admin.css` is imported **only by Admin pages** (14 import sites, all under `pages/admin/`). It is **not** in `main.jsx`. Therefore, in Trainer routes:

- **`PageHeader` renders completely unstyled** → used by `Students.jsx:191`, `Analytics.jsx:113`, `Monitoring.jsx:156`.
- **`Modal` renders completely unstyled** (no overlay backdrop, no dialog box, no header/close button styling) → **8 modal instances**: `Students.jsx:315`, `BatchStudentsList.jsx:240, 252`, `ProblemsList.jsx:317, 328`, `Assignments.jsx:433, 501, 544`, `TrainingManagement.jsx:456, 513`.
- **`DataTable` loses all `admin-table` styling** → `Students.jsx:306`.

Verified: no match for `admin-modal|admin-page-header|admin-breadcrumb|admin-page-title|admin-header-actions|admin-table` anywhere in `styles/*.css` or `styles/components/*.css`.

This is the single highest-impact CSS finding and it explains why the Trainer module looks visually inconsistent despite reusing Admin components.

### D.4 Trainer CSS inventory

| File | Lines (nb) | BEM prefixes | Custom props | Hardcoded hex | Hardcoded `rgba()` |
|---|---|---|---|---|---|
| `styles/pages/trainer.css` | 533 | `trainer-page`, `-card`, `-btn`, `-table`, `-badge`, `-avatar`, `-empty`, `-error`, … | defines 55 `--trainer-*` | 1 | 6 |
| `styles/pages/trainer-dashboard.css` | 437 | `trainer-dashboard__*`, `trainer-submissions-*`, `trainer-leaderboard-*` | `--trainer-*` | 1 | 2 |
| `styles/pages/trainer-batches.css` | 615 | `trainer-batches`, `trainer-batch-card`, `trainer-batch-detail` | global `theme.css` | 2 | 12 |
| `styles/pages/trainer-students.css` | 330 | `trainer-students` | global | 1 | 12 |
| `styles/pages/trainer-problems.css` | 284 | `trainer-problems` | global | 8 | 24 |
| `styles/pages/trainer-assignments.css` | 296 | `trainer-assignments` | global | 9 | 15 |
| `styles/pages/trainer-training.css` | 316 | `trainer-training` | global | 0 | 6 |
| `pages/trainer/Analytics.css` | 105 | `an-*` | global | 12 | 0 |
| `pages/trainer/Monitoring.css` | 80 | `mo-*` | global | 7 | 0 |
| `pages/trainer/TrainingManagement.css` | 203 | `tm-*` | global | 5 | 0 |
| **Total** | **~3,244** | | | **46** | **77** |

**Token-strategy split:** `trainer.css` + `trainer-dashboard.css` use the private `--trainer-*` namespace. The other eight files use **global `theme.css` tokens**. Result: the same logical element resolves to **different colours** per page — page titles are `var(--trainer-text-primary)` = `#0F2441` in `trainer-dashboard.css:64` but `var(--color-heading)` = `#2d2e33` in `trainer-batches.css:46`, `trainer-students.css:61`, `trainer-problems.css:61`, `trainer-assignments.css:57`.

### D.5 CSS duplication

**~34 normalized selector families span ≥2 files; 26 are byte-identical.**

| Family | Files |
|---|---|
| `__crumb`, `__crumb a`, `__crumb a:hover`, `__crumb-sep`, `__crumb-current` | `trainer-batches.css:423-451`, `trainer-students.css:20-46`, `trainer-problems.css:20-46`, `trainer-assignments.css:20-43` — **plus** a 5th variant `trainer-breadcrumb*` in `trainer.css:122-148`, **plus** `admin.css:33-61` |
| `__modal-actions` | `trainer-students.css:358`, `trainer-problems.css:279`, `trainer-assignments.css:311` |
| `__empty`, `__empty h2`, `__empty p` | `trainer-students.css:236,249,256`, `trainer-problems.css:253,266,273`, `trainer-assignments.css:248,261,268`, `trainer-batches.css:406,414`, `trainer-training.css:257,264` |
| `__header`, `__header-actions` | 6 files, **6 different bodies** |
| `__summary`, `__summary-item`, `__summary-label`, `__summary-value` | 3 files, 3 different `minmax()` tile widths |
| `__title`, `__description` | 5 files each, 3 distinct bodies |
| `__toolbar`, `__filter-select`, `__search` | `trainer-students.css`, `trainer-problems.css`, `trainer-batches.css` |
| `__error` | `trainer-students.css:162`, `trainer-problems.css:146` |
| table chrome (`thead th/td`, `tbody tr:hover`) | `trainer.css:404-447`, `trainer-dashboard.css:415-442` |
| fade-in keyframes | **7 separate definitions** of the same 2 keyframes across 7 files |

Also: **3 copies of an identical ad-hoc danger palette** (`#B42318` + `rgba(180,35,24,.05/.15)`) at `trainer-students.css:163-167`, `trainer-problems.css:147-151`, `trainer-assignments.css:89-92` — all bypassing the existing `--trainer-danger-*` tokens at `trainer.css:51-53`.

`trainer-assignments.css:117,197,202,208,215` and `trainer-problems.css:209-215` introduce a **second, un-tokenized Tailwind-style palette** (`#059669`, `#dc2626`, `#d97706`, `#64748b`, `#2563eb`, `#94a3b8` + 5 rgba variants) that exists nowhere else in the project.

### D.6 Unstyled components and orphans

**11 of 20 Trainer page files import no CSS at all** (11 of 20 page files; 21 including the orphan modal):

`EnrollmentDetails.jsx`, `Performance/BatchPerformance.jsx`, `Performance/ProblemPerformance.jsx`, `Performance/StudentPerformance.jsx`, `ProblemDetails.jsx`, `ProblemEditor.jsx`, `Students.jsx`, `TestCasesList.jsx`, `TrainerLayout.jsx`, `TrainerProblems.jsx`, `TrainerProfile.jsx`.

**Broken CSS import:** `pages/trainer/components/BulkImportModal.jsx:8` imports `../../styles/pages/trainer-problems-hierarchy.css` — **this file does not exist** (only `admin-problems-hierarchy.css` does). The component is unstyled and **is not imported by any file** → 229 lines of dead, broken code.

**Dead stylesheet:** `pages/trainer/TrainingManagement.css` (203 nb lines, 28 `.tm-*` classes) is **never imported**. `TrainingManagement.jsx` uses **zero** `.tm-*` classes and instead applies 11 `trainer-*` class names that **exist in no stylesheet**: `trainer-section` (`:248,288,361,404`), `trainer-section-description` (`:292,363,406`), `trainer-select-label` (`:222`), `trainer-list` (`:320`), `trainer-row` (`:322`), `trainer-row-info` (`:323`), `trainer-row-title` (`:324`), `trainer-row-meta` (`:325`), `trainer-row-actions` (`:341`), `trainer-grid` (`:387,410`), `trainer-grid-card*` (`:389-392`). Plus `trainer-students-page` (`Students.jsx:190`) and `trainer-batch-card__heading` (`BatchesList.jsx:37`).

**~34 orphan class references** in Trainer JSX resolve to nothing.

### D.7 Responsiveness

**Trainer breakpoints: 10 distinct widths** (359, 480, 560, 767, 1024, 1199).
**Admin breakpoints: 9** (480, 520, 560, 600, 640, 767, 768, 860, 1024) + `prefers-color-scheme` + `prefers-reduced-motion`.

Specific gaps:
- `Monitoring.css:4` uses a **fixed 360px sidebar column**; the only media query is `max-width: 1199px` (`Monitoring.css:91`). There is **no 767px rule and no reduced-motion block** → at 700px viewport the layout is cramped; the dashboard's own siblings animate unconditionally.
- `Analytics.css:118` has a 767px rule but **no `prefers-reduced-motion`**.
- `TrainingManagement.css:206,213` — no reduced-motion.
- `trainer-students.css:371-373` **hides the table at ≤767px** with the comment "fallback or card layout for mobile if desired" — **no card layout exists**, so Batch Students is blank on mobile.
- 7 files define page-shell padding independently (`trainer.css:473` `24px 28px 40px` vs `trainer-batches.css:13` `var(--space-8)`).

### D.8 Broad selectors & conflicts with Admin

Trainer CSS is **well namespaced** — zero literal selector collisions with Admin. Findings:
- `styles/pages/trainer.css:11` `:root { … }` — global-scope token declaration (namespaced `--trainer-*`, so no visual leak).
- `pages/trainer/TrainingManagement.css:227` `.tm-day-actions .btn` — reaches outside `tm-*` into the shared `.btn`. Dormant (file never imported).
- 56 bare-element selectors in Trainer CSS, all as **scoped descendants** (`.trainer-table th`, `.trainer-empty h2`) — no leakage.
- **`components/ui/Input.jsx` and `Progress.jsx` use Tailwind class names** (`block w-full rounded-md border border-input …`). **Tailwind is not installed** (`package.json` has no `tailwindcss`). These components are therefore entirely unstyled and must not be reused until fixed — or must be given a CSS-class-based implementation.
- `styles/global.css:30-51` applies an **unscoped `button { … }`** rule; the four Trainer components that emit raw `<button>`/`<table>` (`TrainerProblems.jsx:61-84`, `TestCasesList.jsx:80-94`, `ProblemPerformance.jsx:50-63`, `ProblemEditor.jsx:218-232`) inherit it and fight their inline overrides.

### D.9 `alert()` / `window.confirm`

4 occurrences, **all in Trainer** — the only blocking browser dialogs in the codebase:
`TrainingManagement.jsx:169`, `:185` (`alert`); `EnrollmentDetails.jsx:35`, `TestCasesList.jsx:48` (`window.confirm`).
A working `ui/Toast` + `toast/ToastProvider` and `ui/Modal` already exist; neither is used by Trainer.

### D.10 Inline styles in Trainer JSX

**210 `style={{}}` attributes across 14 Trainer JSX files.** Only **3 are legitimate data-driven values** (`Assignments.jsx:411`, `Monitoring.jsx:322, 334` — percentage bar widths). The other 207 are static layout/colour that duplicate CSS rules that already exist.

Top: `Students.jsx` (40), `TrainingManagement.jsx` (39), `ProblemEditor.jsx` (23), `BatchDetails.jsx` (18), `TrainerProblems.jsx` (18), `ProblemsList.jsx` (12), `TestCasesList.jsx` (12), `ProblemPerformance.jsx` (13).

### D.11 Admin reference conventions to match

- **Class naming:** single `.admin-*` namespace, flat block names, explicit BEM (`admin-breadcrumb__item`/`__separator`/`__current`, not collapsed kebab). Kebab reserved for state slots (`admin-dashboard__header-content`).
- **Tokens:** `admin.css:63-156` declares 73 `--admin-*` tokens mirroring `--trainer-*` 1:1. Page files consume both `--admin-*` and global theme tokens, and use `var(--token, #fallback)` defensively (`admin.css:17`, `admin-problems.css:262`).
- **Table:** `admin.css:526-611` — `.admin-table-wrapper { overflow-x:auto }`, uppercase 11px `th` with `letter-spacing`, centred cells, `tbody tr:hover`, `.admin-avatar--trainer|--student` variants, `.admin-pagination`.
- **Card:** `.admin-card` (`admin.css:162`) + `--hover` lift (`:170`) + `.admin-dashboard__stat-card` (`:1215`) + `.admin-card-empty` (`:1102`) — **the last one is a ready-made empty-state utility Trainer hand-rolls 5 times**.
- **Modal:** `admin.css:1128-1212` — uses `__footer`, **not** `__modal-actions` (which Trainer defines 4×). Focus restoration and Escape handling already implemented in `Modal.jsx`.
- **States:** `.admin-empty` (`:1319`), `.admin-error-box` (`:1087`), `.admin-message-center` (`:1121`), global `.skeleton`.
- **Focus:** one consolidated `admin.css:1337-1344` `:focus-visible` rule.

---

## E. Feature and Permission Audit

### E.1 Feature classification

| Feature | Classification | Evidence |
|---|---|---|
| **Trainer Dashboard** | **PARTIAL** | Route + KPI grid + batch switcher + My Batches + leaderboard preview all work. **Broken**: primary CTA → non-existent route (§A.3.2); Recent Submissions permanently empty (§C.3); 2 of 5 leaderboard columns always `—`; "Across all batches" labels are false. |
| **My Batches** | **IMPLEMENTED** | `BatchesList.jsx` — search, summary strip (total/active/students), card grid, skeletons, error+retry, empty states. Only defect: literal `&apos;` string (`BatchesList.jsx:198`). |
| **Batch Details** | **PARTIAL** | `BatchDetails.jsx` — breadcrumb, status, summary, module nav, 3 gateway cards, performance snapshot all real. Two nav items hard-coded `{ unavailable: true }` despite `/trainer/monitoring` existing; heavy inline styles; no student/problem counts beyond `studentCount`. |
| **Students (cross-batch)** | **PARTIAL** | `Students.jsx` — list, search, summary, manual-card/`DataTable` mobile switch, add-by-student-ID modal calling `enrollStudent`. 40 inline styles, undefined class `trainer-students-page`, 3 undefined CSS properties, hand-rolled resize listener. |
| **Students (batch-scoped) + progress visibility** | **PARTIAL** | `BatchStudentsList.jsx` — table, bulk select, unenroll, debounced search, enroll modal all implemented. **Blocked by a backend route-ordering bug** (`getAvailableBatchStudents` → always 400, §C.4). Table hidden entirely ≤767px. `EnrollmentDetails.jsx` is unstyled and uses `window.confirm`. |
| **Trainer-created problems** | **PARTIAL** | Full CRUD exists: `ProblemsList.jsx` (list/filter/archive/bulk-JSON-import/template-download), `ProblemEditor.jsx` (create+edit+collection/topic cascade), `ProblemDetails.jsx`, `TestCasesList.jsx`. `ProblemEditor` is entirely unstyled with hardcoded `#ccc`/`#007bff`. `TrainingManagement.jsx` creates problems **without `description`** (`:155-159`), which the editor treats as required (`:183`). |
| **Global problem browsing** | **PARTIAL** | There is **no general trainer browse of global problems**, and that is by design. The only global-problem surface is the assignable catalogue `GET /trainer/batches/:batchId/assignments/problems` (`backend/.../assignments.js:272-282`), surfaced as a `<select>` in `Assignments.jsx:436-447`. `/trainer/problems` (`TrainerProblems.jsx`) is an N+1 fan-out over the trainer's **own batch** problems, not a global catalogue. If "Global problem browsing" means a searchable global catalogue for Trainers, it is **MISSING** — but adding one would require a new backend endpoint, which is out of scope. |
| **Assignments** | **IMPLEMENTED** | `Assignments.jsx` + `Assignments.test.jsx` (16 tests). Batch picker, scoped CRUD list, open-ended availability (`availableFrom` only, no due date), 409 duplicate handling, soft delete, completion % with correct null-denominator suppression. Correctly mirrors `backend/tests/trainerAssignments.test.js`. |
| **Daily Training** | **PARTIAL** | `TrainingManagement.jsx` exists and reads real collections (`getTrainerCollections`), but: the 4 "Student Progress" metrics are phantom zeros (§C.3); "Training Collections" cards render name + counts with **no drill-down** (`TrainingManagement.jsx:386-399`) even though `getTrainerCollectionTopics` exists; `TrainingManagement.css` is dead; 11 orphan classes; 2 `alert()`; duplicate problem-CRUD already in `ProblemsList`. |
| **Leaderboard** | **IMPLEMENTED (embedded)** | No dedicated endpoint exists and none is needed: the trainer leaderboard is `GET /trainer/analytics → data.leaderboard`, consumed by `Analytics.jsx:223`, `Monitoring.jsx:269`, `Index.jsx:387`. `BatchDetails.jsx:97` still shows an inert "Leaderboard — Upcoming" nav item. Ranking, `solved = ACCEPTED` semantics and tie-break ordering are backend-enforced and regression-tested. |
| **Analytics** | **IMPLEMENTED** | `Analytics.jsx` maps 1:1 to `kpis { activeStudents, assignedProblems, solvedAssignments, completionRate }` + `leaderboard[]` + cascade filters. No fabricated fields. Cosmetic defects only: `PageHeader` unstyled (§D.3), `an-*` prefix is off-convention, `Analytics.css` has the lowest token adoption in the module (28 `var()` refs, 12 hardcoded hex), no reduced-motion. |
| **Monitoring** | **IMPLEMENTED** | `Monitoring.jsx` — same cascade + per-student detail via `getTrainerStudentDetail` (`overall`/`days`/`problems`). All fields real. Cosmetic: fixed 360px panel, no 767px rule, 15 `var()` refs / 7 hex, ~60 lines duplicated with `Analytics.jsx`. |
| **Profile** | **PARTIAL** | `TrainerProfile.jsx` — name/email/role/status + logout. **Duplicate of `pages/Profile.jsx`** minus `status`. Not in the sidebar. `Card elevation="card"` passes an unknown prop (Card accepts `variant`, not `elevation`) → `Card.jsx:12` ignores it, producing `className="card  "`. No edit capability, no avatar, no password change — but those would need new endpoints, so **absence is intentional, not a gap**. |

### E.2 Admin-only action verification

Verified against `backend/src/routes/trainer/*.js` (37 handlers, every one carrying `requireRole('TRAINER')`), `middleware/role.js:15` (exact match), and `services/trainerAuth.js`.

| Admin-only action | Verdict | Evidence |
|---|---|---|
| **Trainer creates a batch** | **DENIED** ✅ | No `POST /api/trainer/batches` handler exists. `trainer/batches.js` registers only `GET /` at `:16` for the collection. Batch creation exists solely at `admin/batches.js:15` behind `requireRole('ADMIN')`. |
| **Trainer creates a student user** | **DENIED** ✅ | `trainer/students.js` has exactly one route: `GET /` at `:17`. No POST/PATCH/DELETE. User/student creation is `admin/users.js:23`, `admin/students.js:48,234` — all `requireRole('ADMIN')`. No self-registration either (`auth.js` has only `POST /login`, `GET /me`, `POST /refresh`). |
| **Trainer enrolls a student** | **ALLOWED — intentional, own batch only** ⚠️ | `POST /trainer/batches/:batchId/students` (`batches.js:323`) is gated by ownership (`:334-336`) and requires the target to already be an **existing ACTIVE STUDENT** (`:339-340`). It cannot create users. `Students.jsx:112` calls it (`enrollStudent`), and `BatchStudentsList.jsx:105` calls `bulkEnrollStudents`. **This is enrollment of existing users into a trainer-owned batch, not student creation — it is the core Trainer responsibility and matches `BatchEnrollmentSection.jsx`'s Admin flow.** Caveat: duplicate enrollment is caught only by the DB unique index and still returns `201` (`batches.js:346-352`), so a re-enroll reports false success. |
| **Trainer modifies a global problem** | **DENIED** ✅ | `services/trainerAuth.js:47` — a `GLOBAL` problem has no `batch`, so it 404s for GET/PATCH/DELETE. Creation is hard-forced to BATCH scope (`problems.js:187`, `:557`), and PATCH **re-pins** scope unconditionally (`problems.js:402-403`). Regression-tested at `backend/tests/trainerProblems.test.js:217-278`. |
| **Trainer touches another trainer's batch** | **DENIED** ✅ | List is scoped (`batches.js:18`); every `:batchId` handler returns 403 (`batches.js:83,136,186,241,306,336,370,393`; `trainerAuth.js:27`; `testCases.js:62`; `performance.js:28,82,125`). Regression-tested at `trainerUnassignedBatchAccess.test.js:175-197, 230-238`. |
| **Trainer reaches admin analytics/reports** | **DENIED** ✅ | All admin routers use `requireRole('ADMIN')` (`admin/reports.js`, `admin/submissions.js`, `admin/settings.js`, `admin/compilerKeys.js`, …). Exact-match role → 403. Tested at `trainerTrainingAccess.test.js:69-86`. |

**Additional backend finding outside Trainer scope (flagged, not fixed here):** `backend/src/routes/admin/system.js` registers `GET /health` (`:15`), `GET /metrics` (`:104`) and `GET /compilers` (`:206`) with **no `requireAuth` and no `requireRole`**. `/metrics` returns platform-wide aggregates plus the 10 most recent **failed submissions including student names and emails** (`:172-196`). Reachable by any anonymous caller. This is a security issue for the Admin surface and should be tracked separately from the Trainer refactor.

**Verdict:** Trainer role separation is sound. No Trainer code path can perform an Admin-only action. The one Trainer capability that superficially resembles an Admin action — enrolling students — is correctly scoped to existing users in the trainer's own batches, and is the trainer's actual job.

---

## F. Tests

Frontend lint was **not** run. The full suite was **not** executed; coverage below is derived by reading test files.

### F.1 Test inventory

13 test files, ~2,979 physical lines, 158 test cases. Runner: Vitest 5 (`vite.config.mjs:6-12`: `environment: 'jsdom'`, `globals: true`, `setupFiles: './src/setupTests.js'`, **`css: true`**).

### F.2 Trainer frontend coverage matrix

| Trainer page | Coverage | Suite |
|---|---|---|
| **`Assignments.jsx`** | **COVERED** | `pages/trainer/Assignments.test.jsx` (348 L, **16 tests**) |
| `Index.jsx` (Dashboard) | none | — |
| `BatchesList.jsx` | none | — |
| `BatchDetails.jsx` | none | — |
| `BatchStudentsList.jsx` | none | — |
| `Students.jsx` | none | — |
| `ProblemsList.jsx` | none | — |
| `ProblemEditor.jsx` | none | — |
| `ProblemDetails.jsx` | none | — |
| `TestCasesList.jsx` | none | — |
| `TrainerProblems.jsx` | none | — |
| `TrainingManagement.jsx` | none | — |
| `Analytics.jsx` | none | — |
| `Monitoring.jsx` | none | — |
| `Performance/BatchPerformance.jsx` | none | — |
| `Performance/StudentPerformance.jsx` | none | — |
| `Performance/ProblemPerformance.jsx` | none | — |
| `EnrollmentDetails.jsx` | none | — |
| `TrainerProfile.jsx` | none | — |
| `components/BulkImportModal.jsx` | none | — |

**1 of 19 pages covered (5%). 0 partial.** Adjacent but **not** Trainer-page coverage: `pages/admin/BatchDetails.test.jsx` (41 tests), `BatchDetails.trainerCard.test.jsx` (15), `Batches.test.jsx` (8), `BatchStudentsList.test.jsx` (7), `Students.test.jsx` (15), `Students.identity.test.jsx` (6), `adminStudentRegression.test.jsx` (6), `student/AssignmentFeed.test.jsx` (11), `student/Problems.test.jsx` (6), `student/Practice.test.jsx` (2), `tests/auth.test.jsx` (2), `utils/academicBatch.test.js` (13).

**API-layer coverage:** 34 exports in `api/trainer.js`; **6** are exercised (all by `Assignments.test.jsx`). The other **28 have zero frontend coverage** — including every bulk enroll/unenroll, all analytics, all collections/topics, all performance calls.

### F.3 `Assignments.test.jsx` detail (the model to protect)

Mocks: full-module `vi.mock('../../api/trainer', …)` factory (`:23-30`) + partial `vi.mock('react-router-dom')` overriding only `useNavigate` (`:18-21`). Harness: real `MemoryRouter`/`Routes`/`Link`; `renderPicker()` at `/trainer/assignments` (`:78`), `renderScoped()` at `/trainer/batches/:batchId/assignments` (`:68`). Responses mirror the axios envelope `{ data: { success, data } }`; errors as `{ response: { status, data: { message } } }`.

16 tests cover: batch picker + navigation; batch-scoped API lazy-guard (not called before a batch is chosen); picker empty state; picker error + retry; list rendering with status/availability/completion; completion-% suppression when `enrolledStudents <= 0`; list empty state; list error + retry; **create payload shape (`{ problemId, title, availableFrom, status }` with no `dueDate`)**; exact assignable option set + ordering; submit disabled with no problem; double-click dedupe via deferred promise + post-create refetch; 409 create copy; non-409 server-message fallback; edit payload + 4 immutability negatives (`problem`/`batch`/`trainer`/`dueDate`); 409 edit copy; soft delete confirm/cancel + refetch.

**Brittleness:** depends on `.closest('li')` (`:108`, `:330`), exact option ordering (`:222`), and ~24 exact text strings including `'1 completed · 3 pending · 4 enrolled · 25%'` (`:155`). Zero CSS-class assertions. **Keep its assertions intact across the refactor** — they encode the API contract.

### F.4 Brittle tests to protect during the refactor

| Test | Coupling | Risk to Trainer refactor |
|---|---|---|
| `trainer/Assignments.test.jsx:23-30` | Full-module `vi.mock` factory with no `importActual` spread | **HIGH** — if the refactor imports a new `api/trainer` export into `Assignments.jsx`, the test throws *"No X export is defined on the mock"*. Fix: add `importActual`. |
| `trainer/Assignments.test.jsx:108, :330` | `.closest('li')` on rows | **MEDIUM** — wrapping rows in a `Card`/`div` breaks it |
| `trainer/Assignments.test.jsx:292, :331, :344` | Exact button names `Edit`, `Remove` | **MEDIUM** |
| `admin/BatchDetails.trainerCard.test.jsx` | 4× `?raw` CSS imports, live `document.styleSheets` walking (`:60-82`), ~30 CSSOM property assertions, **comment-banner slicing** at `:221-231`, unresolved-token string equality, hard-coded `767px` | **HIGH but Admin-scoped** — will fail on any cosmetic Admin CSS change. Do not touch `admin-batch-details.css` during this work. |
| `admin/Batches.test.jsx:138-155` | `?raw` + regex scrape of `.admin-batch-name-btn` | **HIGH but Admin-scoped** |
| `admin/Students.identity.test.jsx:42-65` | `document.styleSheets` exact-selector matching, `toHaveStyle` | **HIGH but Admin-scoped** |
| `admin/BatchStudentsList.test.jsx:68`, `adminStudentRegression.test.jsx:110` | `document.querySelector('.admin-modal-overlay')` | **MEDIUM** — if `Modal.jsx` class names change, these break. **Do not modify `Modal.jsx` class names.** |

**Critical implication:** `BatchDetails.trainerCard.test.jsx` asserts on **`admin-batch-details.css`** only, not on Trainer CSS. Trainer refactors are safe from it **provided** they do not rename `admin-modal-overlay` or the `.admin-*` tokens it asserts. Those live in `Modal.jsx` and `admin.css` — treat both as frozen for this project.

### F.5 Backend trainer tests (not executed)

14 suites, 4,377 lines, **221 cases**, Jest + supertest + Mongo. Strong regression coverage of:

ownership isolation across batches/problems/test-cases/assignments; unassigned batch ⇒ 403; exact role matching in both directions; `solved === ACCEPTED` with duplicate dedupe and `WRONG_ANSWER` exclusion; `(batch, problem, availableFrom)` uniqueness incl. 409 on conflicting PATCH and slot-freeing soft delete; PATCH immutability of `problem`/`batch`/`trainer`/`deleted`; `createdBy`/`trainer` derived from token never body; `passwordHash` never returned; full 400/404/409 matrices; trainer read-only Collections/Topics with field allow-list; `NO_PROBLEMS` never `COMPLETED`/`NaN` on empty training.

**Implication:** the backend contract is well protected. The refactor is a pure frontend/JSX/CSS exercise and needs no backend changes — except the two items in §G.0.

### F.6 Test infrastructure gaps

- No MSW, no `fetch-mock`, no shared test-helper directory. Every test re-declares its own fixtures and `renderPage()`.
- No `matchMedia` / `ResizeObserver` / `IntersectionObserver` stubs in `setupTests.js` — `Students.jsx:60` (`window.innerWidth` resize) and any future CSS-media-driven test needs per-test stubs. Prefer CSS over JS breakpoints when refactoring.
- `@monaco-editor/react` is a dependency but is **not** used by Trainer; if `ProblemEditor` is upgraded to a Monaco editor, tests need a stub.
- No coverage tooling installed (`@vitest/coverage-v8` absent).

---

## G. Refactoring Plan

### G.0 Pre-phase: decisions to make before writing any JSX

These are **not** refactoring items; they need an owner decision and may block acceptance criteria.

| # | Item | Recommendation |
|---|---|---|
| 1 | `GET /trainer/batches/:batchId/students/available` is shadowed by `/:studentId` → always 400 (`batches.js:171` vs `:225`) | **Backend fix**, separate PR, reordering two `router.get` registrations. Frontend cannot work around it. Blocks full acceptance of Phase 2. |
| 2 | `theme.css` / `tokens.css` token collision (§D.2) — 15 visible overrides | **Admin-reviewed change**, separate PR. Trainer must not edit these files. Workaround: Trainer CSS consumes `--admin-*` / self-contained `--trainer-*`. |
| 3 | `PageHeader`/`Modal`/`DataTable` emit `admin-*` classes not loaded in Trainer (§D.3) | Choose **one**: (a) import `admin.css` from `TrainerLayout.jsx` — 1 line, instantly styles 8 modals + 3 headers + 1 table, zero test breakage; or (b) introduce neutral shared class names in the components — a larger change that risks `BatchStudentsList.test.jsx:68`. **Recommend (a) for Phase 1.** |
| 4 | `/trainer/performance` sidebar item has no route | Either add the route or point it at `/trainer/monitoring`. Navigation-only fix. |
| 5 | `admin/system.js` unauthenticated `/metrics` leaks student PII | Security ticket, unrelated to Trainer UI. Track separately. |

### G.1 Global conventions for every phase

- **Tokens:** consume `--admin-*` (frozen, self-contained) or `--trainer-*`. **Never** `theme.css`/`tokens.css` names that collide (`--color-surface`, `--color-canvas`, `--color-border`, `--color-muted`, `--color-text-primary`, `--color-success`, `--font-size-xl/2xl/3xl`). **Never** add a hardcoded hex; the required palette has tokens.
- **Class naming:** `.trainer-<page>-*` with explicit BEM (`__element`, `--modifier`), matching `admin.css` convention (no collapsed kebab for sub-elements).
- **Breakpoints:** `1024px`, `767px`, `560px` only. Always pair width queries with a `prefers-reduced-motion` block.
- **State components:** reuse `.admin-empty`-equivalent and the `Spinner`/`Skeleton` pattern; **never** `alert()` or `window.confirm` (use `ui/Modal` for confirmations, `ui/Toast` for feedback).
- **Forms:** prefer the shared `ui/*` components, but note `ui/Input` and `ui/Progress` currently use **Tailwind classes that don't exist** (`package.json` has no `tailwindcss`) — either fix them first (add `.ui-input`/`.ui-progress` classes) or use labelled `<input className="admin-input">`.
- **Accessibility:** every table gets `<caption class="sr-only">` and `<th scope="col">` (only `Analytics`/`Monitoring` do today); every status colour is paired with text (already the Trainer's strength — preserve it); icon-only buttons need `aria-label`.
- **Tests:** keep `Assignments.test.jsx` assertions intact. Add `importActual` to its `vi.mock` factory first. Write behaviour/role-based tests, never class-based (per §F.4).
- **Frozen:** `Modal.jsx` class names, `admin.css`, `admin-batch-details.css`, `admin-batches.css`, `admin-students.css`.

---

### Phase 1 — Dashboard

**Files to change:** `pages/trainer/Index.jsx`; `styles/pages/trainer-dashboard.css`; `components/navigation/…` or `navigationConfig.js` (if adding Profile); delete or re-scope `getTrainerCollections` fetch.

**Extract:** `components/trainer/KpiGrid.jsx` (+ `KpiGrid.css`) — currently duplicated 6× (§B.4); `components/trainer/SectionCard.jsx` (icon + heading + subtitle + "View All") — duplicated 3× in this one file; swap the three hand-rolled `<table>`s for `ui/DataTable`.

**Fix:** dead "Create Problem" CTA (§A.3.2); drop the `recentSubmissions` section or replace it with a real source (§C.3) — **there is no trainer-wide recent-submissions endpoint, so removal is the only API-safe option**; replace `Avg. Time`/`Accuracy` columns with `Completion %`/`Days Completed` from the real leaderboard payload; correct the "Across all batches" labels; remove the dead `getTrainerCollections` fetch; add the 3 missing `Icon` names (`upload`, `book`, `clipboard`).

**Risks:** medium — the page is untested, so regressions are invisible. Mitigate by extracting pure presentational components that can be snapshot/role-tested before wiring.

**Tests to run:** `npx vitest run src/pages/trainer/Assignments.test.jsx` (regression gate); add `Index.test.jsx` covering: batch switcher triggers `getTrainerAnalytics` with the new `batchId`; KPI values render from `kpis`; leaderboard columns render real fields.

**Acceptance criteria:** no `alert()`; no dead CTA; every rendered column maps to a real `leaderboard`/`kpis` field; no `#` literals; no `getTrainerCollections` call; `560px` + `prefers-reduced-motion` present; zero inline `style={{}}` except percentage widths.

---

### Phase 2 — My Batches and Batch Details

**Files to change:** `pages/trainer/BatchesList.jsx`, `pages/trainer/BatchDetails.jsx`, `pages/trainer/BatchStudentsList.jsx`, `pages/trainer/EnrollmentDetails.jsx`; `styles/pages/trainer-batches.css`, `styles/pages/trainer-students.css`; shared `statusClass` helper (`utils/trainerStatus.js`).

**Extract:** `components/trainer/Breadcrumb.jsx` — duplicated across 5 Trainer pages with 6 implementations (§D.5); `components/trainer/SummaryStrip.jsx` — duplicated across 5 pages; shared `utils/trainerStatus.js` — `statusClass` triplicated (`BatchesList.jsx:9`, `BatchDetails.jsx:10`, `Assignments.jsx:18`).

**Fix:** literal `&apos;` (`BatchesList.jsx:198`); replace the 8-item nav with only real routes (drop the two `{ unavailable: true }` stubs, point Monitoring at `/trainer/monitoring`); replace the 18 inline styles in `BatchDetails.jsx` (the h2/p typography it re-inlines already exists at `trainer-batches.css:609-620`); style `EnrollmentDetails.jsx` and replace `window.confirm` with a `ui/Modal`; restore a mobile layout for `trainer-students.css:371-373` (currently `display:none` with no replacement).

**Risks:**
- `getAvailableBatchStudents` is broken backend-side (§G.0 #1) — the enroll modal will look broken until that lands. **Sequence Phase 2's enroll work after the backend fix.**
- Do not rename `admin-modal-overlay` (§F.4).

**Tests to run:** `Assignments.test.jsx`; add `BatchesList.test.jsx` (search filters by name/code, summary counts, empty vs no-match states) and `BatchDetails.test.jsx` (breadcrumb, summary, module nav targets, performance-snapshot fallback).

**Acceptance criteria:** one `Breadcrumb` component used by all Trainer pages; `statusClass` defined once; zero `&apos;` in strings; zero `window.confirm`; mobile table→card layout exists at ≤767px; all module-nav items resolve to real routes.

---

### Phase 3 — Problems and Problem Editor

**Files to change:** `pages/trainer/ProblemsList.jsx`, `ProblemEditor.jsx`, `ProblemDetails.jsx`, `TestCasesList.jsx`, `TrainerProblems.jsx`; **delete** `pages/trainer/components/BulkImportModal.jsx` (dead + broken CSS import) and `styles/pages/trainer-problems-hierarchy.css` reference; `styles/pages/trainer-problems.css`.

**Extract:** `components/trainer/ProblemRow.jsx` — duplicated between `ProblemsList.jsx:285-313` and `TrainingManagement.jsx:320-357`; `components/trainer/ImportProblemsModal.jsx` — move `ProblemsList.jsx:328-411`'s import logic into a component (this is where `BulkImportModal`'s real functionality should land); `components/trainer/CollectionTopicSelect.jsx` — the cascade is implemented 4× (`ProblemEditor.jsx:32-53`, `Analytics.jsx:66-82`, `Monitoring.jsx:85-101`, `TrainingManagement.jsx:73-93`).

**Fix:** rewrite `ProblemEditor.jsx` entirely — it has **zero** styling, hardcoded `#ccc`/`#007bff`/`#888`, `c.id || c._id` Mongo-style fallbacks (`ProblemEditor.jsx:134, 164`) that do not belong in a Mongoose-backed app, and `c`-prefixed variable names. Same for `ProblemDetails.jsx`, `TestCasesList.jsx`, `TrainerProblems.jsx` (11 `#ccc` on a raw `<table>`). Add the missing `description` field to `TrainingManagement.jsx:155-159`'s `createProblem` payload to match `ProblemEditor.jsx:94`.

**Risks:** medium — `TrainerProblems.jsx` performs an N+1 fan-out; keep behaviour identical, but consider a bounded/sequential fetch. The broken `getAvailableBatchStudents` bug is unrelated here.

**Tests to run:** `Assignments.test.jsx` (assignable-problem catalogue is exercised there); add `ProblemsList.test.jsx` (search/difficulty/status filters, archive confirm → `deleteProblem`, import payload shape `{ problems, collectionId, topicId }`, template download blob) and `ProblemEditor.test.jsx` (create vs edit payload, collection→topic reset).

**Acceptance criteria:** zero inline `style={{}}`; zero `#` literals; no `c.id || c._id` fallbacks; `BulkImportModal.jsx` deleted and its import logic living in a styled component; `createProblem` payloads always include `description`.

---

### Phase 4 — Assignments

**Files to change:** `pages/trainer/Assignments.jsx` (minimal); `styles/pages/trainer-assignments.css` (tokenise); possibly `utils/trainerStatus.js`.

**Extract:** `components/trainer/Breadcrumb.jsx`, `components/trainer/FormField.jsx` (`.trainer-assignments__field` at `trainer-assignments.css:277-302`), `components/trainer/ModalFooter.jsx` (the `__modal-actions` block duplicated 4×).

**Fix:** replace the 9 hardcoded hex + 15 rgba in `trainer-assignments.css` (the un-tokenized Tailwind palette at `:117,197,202,208,215`) with `--admin-*` tokens; swap the 3 copies of the ad-hoc `#B42318` danger palette for `--trainer-danger-*`.

**Risks:** **highest in the project** — this is the only covered Trainer page and it pins exact text, `.closest('li')` structure, option ordering, and label `htmlFor`/`id` pairs. **Restrict Phase 4 to CSS-only changes plus extraction that preserves DOM shape.** If DOM shape must change, update `Assignments.test.jsx` in the same commit and keep every assertion semantically equivalent.

**Tests to run:** `npx vitest run src/pages/trainer/Assignments.test.jsx` — **must stay at 16/16 passing, unmodified**, unless a deliberate DOM change is documented. Add `importActual` to the `vi.mock` factory at `:23-30` first, as a standalone commit.

**Acceptance criteria:** all 16 existing tests green without assertion edits; zero hardcoded hex in `trainer-assignments.css`; `__modal-actions` reduced to one definition; `htmlFor`/`id` pairs unchanged (`assignment-problem`, `assignment-title`, `assignment-available-from`, `assignment-status`, `edit-title`, `edit-available-from`, `edit-status`).

---

### Phase 5 — Daily Training

**Files to change:** `pages/trainer/TrainingManagement.jsx`; **delete** `pages/trainer/TrainingManagement.css` (dead, never imported).

**Extract:** `components/trainer/CollectionTopicSelect.jsx` (shared with Phase 3/6); reuse `ProblemRow` from Phase 3 — this should largely **delete** the duplicate problem CRUD rather than restyle it.

**Fix:** remove the 4 phantom metrics `performance.assigned/attempted/completed/pending` (`TrainingManagement.jsx:417,427,437,447`) — **or replace them with the 4 real fields the batch-performance API does return** (`totalProblems`, `totalSubmissions`, `solvedProblems`, `progress`, per `backend/.../performance.js:46-54`); replace both `alert()` calls (`:169`, `:185`) with `ui/Toast`; make the "Training Collections" cards (`:386-399`) drill into topics using `getTrainerCollectionTopics` instead of rendering dead cards; eliminate the 11 orphan class names (§D.6).

**Risks:** medium — deciding "remove vs remap" the phantom metrics is a product call. **Recommend remapping** to the four real fields so the section keeps its value rather than shrinking.

**Tests to run:** `Assignments.test.jsx` (shared `CollectionTopicSelect`); add `TrainingManagement.test.jsx` (batch selector drives the `batchId` search param; collection cards load topics; archive confirm → `deleteProblem`; progress tiles render only real API fields).

**Acceptance criteria:** zero `alert()`; zero references to fields absent from the batch-performance response; `TrainingManagement.css` deleted; zero orphan class names; every collection card is interactive or removed.

---

### Phase 6 — Leaderboard

**No dedicated route exists and none is needed.** The trainer leaderboard is `data.leaderboard` from `GET /api/trainer/analytics`, already rendered in three places.

**Files to change:** `pages/trainer/Analytics.jsx`, `pages/trainer/Monitoring.jsx`; `pages/trainer/Analytics.css`, `Monitoring.css`; possibly `navigationConfig.js` (fix `/trainer/performance`).

**Extract (highest value in the project):** `components/trainer/CascadeFilters.jsx` — the identical Batch→Training→Day→Status cascade (`Analytics.jsx:44-63, 120-168` ≈ `Monitoring.jsx:56-83, 163-214`); `components/trainer/LeaderboardTable.jsx` (`Analytics.jsx:208-235` ≈ `Monitoring.jsx:254-292`); `components/trainer/KpiGrid.jsx` (shared with Phase 1); `components/trainer/StudentDetailPanel.jsx` (`Monitoring.jsx:298-359`).

**Fix:** consolidate the two pages onto one `ProgressExplorer` with a `variant` prop (`leaderboard` | `monitoring`), or keep both routes as thin wrappers over the extracted components — **prefer the wrappers**, since both URLs are already linked from the sidebar. Fix `Monitoring.css:4`'s fixed `360px` column; add `767px` + `prefers-reduced-motion` to `Monitoring.css`. Merge the `an-*`/`mo-*` prefixes into a single `trainer-analytics-*` namespace. Replace `navigationConfig.js:53`'s `/trainer/performance`.

**Risks:** medium — `statusBadgeVariant` is duplicated (`Analytics.jsx:108` ≈ `Monitoring.jsx:148`); keep both `<table>`s' column order and header text byte-identical since no test pins them but downstream users rely on them.

**Tests to run:** `Assignments.test.jsx`; add `Analytics.test.jsx` and `Monitoring.test.jsx` (filter cascade clears children; KPI grid renders `kpis`; leaderboard renders all 7 real fields; selecting a student calls `getTrainerStudentDetail` with the right params; error + retry).

**Acceptance criteria:** `an-*` and `mo-*` prefixes gone; the cascade filter logic exists once; no leaderboard column absent from the API payload; `Monitoring` usable at 700px; `/trainer/performance` sidebar link resolves to a real route.

---

### Phase 7 — Analytics

Covered with Phase 6 (same components). Additional standalone work:

**Files to change:** `pages/trainer/Students.jsx`; `styles/pages/trainer-students.css`.

**Extract:** `components/trainer/EnrollmentTable.jsx` — `Students.jsx:142-312` and `BatchStudentsList.jsx:165-238` are the same domain rendered twice. Consider making `Students.jsx` a cross-batch view of the same component.

**Fix:** the 40 inline styles in `Students.jsx`; the undefined class `trainer-students-page` (`:190`); the undefined custom properties `--font-size-body` (`:240,258,275,332,361`), `--color-surface-hover` (`:254`), `--color-danger` (`:367`); **replace the hand-rolled `window.innerWidth < 768` resize listener (`:26, 59-63`) with CSS** (this is also what blocks testability — see §F.6); remove the duplicate `+ Add Student` button that appears both in the header and the empty state.

**Note on scope:** `Students.jsx`'s "Add Student" calls `enrollStudent` (§E.2) — **it enrolls an existing student into a batch, it does not create users.** Rename the UI affordance to "Enroll Student" and require a batch selection first, so the capability cannot be misread as user creation.

**Risks:** medium-high — this is the most inline-styled page and has a real behavioural question (is a global students view even needed, given `BatchStudentsList` exists?). **Recommend keeping it** but reimplementing it as a thin cross-batch wrapper over `EnrollmentTable`.

**Tests to run:** `Assignments.test.jsx`; add `Students.test.jsx` (search across name/email/id/batch, summary counts, enroll-modal submission calls `enrollStudent` with `{ studentIds: [id] }`).

**Acceptance criteria:** zero inline `style={{}}`; zero undefined class/property references; no `window` resize listener; mobile handled by CSS; the enroll affordance is labelled "Enroll Student" and is batch-scoped.

---

### Phase 8 — Profile

**Files to change:** `pages/trainer/TrainerProfile.jsx`, `pages/Profile.jsx`, `navigationConfig.js`, `styles/theme.css` *(frozen — use existing tokens)*.

**Extract:** one `ProfilePage` component taking a `showStatus` flag; `TrainerProfile` and `Profile` both render it. Add Profile to the TRAINER `System` group in `navigationConfig.js` (which is currently empty, `:59-62`).

**Fix:** `Card elevation="card"` (`:22`) passes a prop `Card` does not accept (`Card.jsx:12` reads `variant`, not `elevation`) → emits `className="card  "` with a stray space. Replace with `variant="elevated"` or add an `Avatar`.

**Risks:** **low**. Do not add edit/profile-update capability — no backend endpoint exists and adding one is out of scope.

**Tests to run:** `npx vitest run src/tests/auth.test.jsx` (guards `useAuth` shape); add `TrainerProfile.test.jsx` (renders name/email/role/status from `useAuth`, logout calls `logout()`).

**Acceptance criteria:** one profile component, two thin wrappers; no invalid `Card` props; Profile reachable from the sidebar; no new endpoints or fields invented.

---

### Phase 9 — Responsive / accessibility verification

**Files to change:** all Trainer CSS + JSX touched in Phases 1–8.

**Checklist:**
- Viewports: 360, 480, 560, 767, 768, 1024, 1199, 1440.
- Breakpoints limited to `1024 / 767 / 560`; every file gains a `prefers-reduced-motion` block (`Analytics.css`, `Monitoring.css`, `TrainingManagement.css` currently have none).
- Tables: wrap in `overflow-x:auto`; `<caption class="sr-only">` + `<th scope="col">` on all Trainer tables (only `Analytics`/`Monitoring` comply today — `Index.jsx`, `ProblemsList`, `BatchStudentsList`, `TrainerProblems`, `TestCasesList`, `ProblemPerformance` do not).
- `trainer-students.css:371-373` currently hides the table at ≤767px with no replacement — restore a card layout.
- `Monitoring.css:4` fixed `360px` panel must collapse.
- Every icon-only control has `aria-label`; every status colour is paired with text (preserve the existing convention); modals keep Escape + focus restore (`Modal.jsx` already implements both).
- Zero raw `<table>`/`<button>` inheriting the unscoped `global.css:30-51` button rule.
- Keyboard pass over every modal, form and table.

**Risks:** low (verification only).

**Tests to run:** the full frontend suite as a regression gate.

**Acceptance criteria:** no horizontal scroll at 360px; no console warnings; full keyboard operability; every image/icon labelled; contrast for status text ≥ 4.5:1 against its actual (token-overridden) background — note `--color-success` currently resolves to `#5c6b73`, which affects `trainer-batches.css:220`.

---

### Phase 10 — Regression tests and production build

**Files to change:** new `*.test.jsx` files only.

**Order of work:**
1. Add `importActual` to `Assignments.test.jsx:23-30` (standalone commit, no behaviour change).
2. Add per-phase tests as each phase lands (§ above).
3. Full suite: `npm test` in `frontend/`.
4. Production build: `npm run build` in `frontend/`. Confirm `dist/` output size and that no CSS is dropped.
5. Manual smoke of all 21 routes (`AppRoutes.jsx:101-133`) as a Trainer, plus one negative check per permission in §E.2.

**Risks:** low. **Do not run `npm run lint`** (out of scope per the brief) — lint status is unchanged by this plan and must not be asserted.

**Acceptance criteria:** `Assignments.test.jsx` still 16/16 with unmodified assertions; every Phase 1–8 test green; `npm run build` succeeds; all 21 Trainer routes render without console errors; the four broken routes from §A.3/§C.4 no longer produce a redirect to `/login`; `admin-batch-details.css`, `admin-batches.css`, `admin-students.css` and `Modal.jsx` class names untouched (so the Admin CSS-coupled tests stay green).

---

## Summary

### Actual Trainer pages found

**19 distinct page components across 21 routes**, ~4,702 physical lines in `frontend/src/pages/trainer/`:

1. `Index.jsx` (415) — Dashboard
2. `BatchesList.jsx` (214) — My Batches
3. `BatchDetails.jsx` (269) — Batch Details
4. `BatchStudentsList.jsx` (300) — Batch Students
5. `Students.jsx` (384) — cross-batch Students
6. `EnrollmentDetails.jsx` (61)
7. `ProblemsList.jsx` (414) — batch problems
8. `ProblemEditor.jsx` (236) — create/edit
9. `ProblemDetails.jsx` (42)
10. `TestCasesList.jsx` (103)
11. `TrainerProblems.jsx` (101) — `/trainer/problems`
12. `TrainingManagement.jsx` (526) — Daily Training
13. `Assignments.jsx` (556)
14. `Analytics.jsx` (242)
15. `Monitoring.jsx` (364)
16. `Performance/BatchPerformance.jsx` (66)
17. `Performance/StudentPerformance.jsx` (62)
18. `Performance/ProblemPerformance.jsx` (74)
19. `TrainerProfile.jsx` (30)

Plus `TrainerLayout.jsx` (14) and one dead orphan, `components/BulkImportModal.jsx` (229).

**Nothing is "missing" from the route table.** The gaps are inside pages, not in routing — with two exceptions: `/trainer/performance` (nav item with no route) and `/trainer/profile` (route with no nav item).

### Biggest JSX/CSS problems

1. **Shared components render unstyled in Trainer.** `PageHeader`, `Modal` and `DataTable` emit `admin-*` classes, but `admin.css` is imported only by Admin pages. **8 Trainer modals, 3 page headers and 1 table have no styling at all.** Highest impact, and fixable with one import.
2. **`Analytics.jsx` and `Monitoring.jsx` are the same page** — identical filter cascade, KPI grid and leaderboard table, ~60 duplicated lines across two files.
3. **11 of 19 Trainer pages import no CSS.** `ProblemEditor`, `TrainerProblems`, `TestCasesList`, `ProblemDetails`, `EnrollmentDetails`, `Students`, `Performance/*` are raw HTML with `1px solid #ccc` borders (×18), `color:'red'` (×11) and `#007bff`.
4. **210 inline `style={{}}` attributes** across 14 files; only 3 are data-driven.
5. **Two token namespaces, both partially dead.** `theme.css` and `tokens.css` collide on 45 names with `tokens.css` silently winning — 15 with visible effect (page titles render `#2d2e33` instead of `#0F2441`; ACTIVE badges render grey-on-green; error text renders black). 6 more properties are referenced but never defined.
6. **~34 duplicated CSS selector families**, 26 byte-identical. The breadcrumb alone exists in **6 implementations**; `__modal-actions` in 4; empty-state blocks in 5; fade-in keyframes defined **7 times**.
7. **Broken and dead assets.** `BulkImportModal.jsx` imports `trainer-problems-hierarchy.css`, which **does not exist** — and the component is imported by nothing. `TrainingManagement.css` (203 lines) is never imported, while `TrainingManagement.jsx` applies **11 class names that exist in no stylesheet**.
8. **Test coverage is 1 of 19 pages (5%).** 28 of 34 `api/trainer.js` functions are untested.
9. **Two broken routes in production use:** the Dashboard's primary "Create Problem" CTA and the sidebar "Performance" item both hit non-existent paths and **redirect the trainer to `/login`** — an effective logout.
10. **Blocking browser dialogs:** 2 `alert()` + 2 `window.confirm`, all in Trainer, despite working `ui/Toast`/`ui/Modal` existing.

### Features already working

- **Assignments** — the one genuinely complete, tested Trainer feature (16 tests). Batch picker, scoped CRUD, open-ended availability, 409 duplicate handling, soft delete, completion %.
- **My Batches** — search, summary strip, card grid, skeletons, error+retry, empty states.
- **Analytics and Monitoring** — map 1:1 to real `kpis`/`leaderboard`/`studentDetail` fields, with correct cascade-filter semantics and request cancellation.
- **Leaderboard** — working via `data.leaderboard`; no separate endpoint needed or wanted.
- **Batch Students** — table, bulk select, unenroll, debounced search (enrollment *modal* is blocked by a backend route-ordering bug, §G.0 #1).
- **Trainer problem CRUD** — list, filter, archive, bulk JSON import, template download, collection/topic linking, test cases. Functional; unstyled.
- **Permission separation** — verified sound. Trainers **cannot** create batches, create students, modify global problems, touch another trainer's batch, or reach admin reports. All 37 trainer handlers carry `requireRole('TRAINER')`; the 403 matrix is regression-tested backend-side.

### Missing or unverified functionality

| Item | Status |
|---|---|
| **Global problem browsing for Trainers** | **MISSING by design.** The only global-problem surface is the assignable-catalogue `<select>` in Assignments. A searchable global catalogue would need a new backend endpoint — out of scope. |
| **`/trainer/performance`** | **MISSING route** referenced by the sidebar. |
| **Profile in navigation** | **MISSING nav entry.** |
| **Training Collections drill-down** | **PARTIAL** — cards render name + counts with no navigation, though `getTrainerCollectionTopics` exists. |
| **Dashboard "Recent Submissions"** | **MISSING data.** `analytics.recentSubmissions` does not exist in the API; the section can never populate. **No trainer-wide recent-submissions endpoint exists**, so removal is the only API-safe fix. |
| **Dashboard "Student Progress" on Daily Training** | **PHANTOM.** All 4 metrics are fields the API does not return → permanently `0`. |
| **Dashboard leaderboard columns** | **UNSUPPORTED.** `Avg. Time` and `Accuracy` are not in the payload → always `—`. |
| **Bulk import modal** | **DEAD + BROKEN** — unimported, and its CSS import target does not exist. |
| **`ui/Input`, `ui/Progress`** | **NOT VERIFIED as reusable** — they emit Tailwind class names but Tailwind is not installed, so they render unstyled. Fix before reuse. |
| **Backend `GET /trainer/batches/:batchId/students/available`** | **BROKEN** — shadowed by `/:studentId`, returns 400 for every batch. Backend fix required. |
| **`admin/system.js` `/metrics`** | **UNAUTHENTICATED** — exposes platform aggregates and student names/emails. Security ticket, Admin-side. |
| Profile editing, password change | **Absent by design** — no backend endpoint. Not a gap. |

### Recommended first implementation phase

**Phase 1 — Dashboard**, preceded by the one-line fix in §G.0 #3 (import `admin.css` from `TrainerLayout.jsx`).

Rationale:
- It is the **entry point for every Trainer session** and the landing route after login, so its quality sets the tone for the whole module.
- It carries the **two hardest user-visible bugs**: the primary CTA that logs the user out (§A.3.2) and the permanently-empty Recent Submissions section (§C.3).
- It contains the **phantom metrics** (§C.3) that must be removed rather than restyled — better surfaced early than late.
- It is the **cheapest place to establish the shared primitives** the later phases depend on: `KpiGrid` (already duplicated across 6 pages), `SectionCard`, `DataTable` adoption, and the `Breadcrumb`/`SummaryStrip` extraction that Phases 2, 5, 6 and 7 all reuse.
- It has **zero existing tests**, so extracting pure presentational components there gives the project its first Trainer-page test coverage without risking the one suite that matters (`Assignments.test.jsx`).
- It carries **no dependency on the blocked backend fix** (§G.0 #1), unlike Phase 2.

Sequencing after Phase 1: **Phase 2** (batches, after the `students/available` backend fix lands) → **Phase 3** (problems) → **Phase 4** (assignments, CSS-only) → **Phase 5** (daily training, largely a deletion) → **Phase 6/7** (analytics + monitoring, the highest-value extraction) → **Phase 8** (profile, trivial) → **Phase 9** (responsive/a11y pass) → **Phase 10** (full regression + production build).

Throughout: **do not modify** `Modal.jsx` class names, `admin.css`, `admin-batch-details.css`, `admin-batches.css`, `admin-students.css`, or `Assignments.test.jsx` assertions — these are pinned by brittle Admin tests that must stay green.