# Student Practice Frontend Audit

## 1. Current Practice Architecture
- **Component**: `frontend/src/pages/student/Practice.jsx`
- **Styles**: `frontend/src/pages/student/Practice.css`
- **Route**: `/student/practice` (registered in `AppRoutes.jsx` under the `/student/*` protected student layout).
- **Current State**: Entirely static and mock-driven. It renders 8 hardcoded problems, static metric cards (120 Total, 48 Solved, 72 Remaining), filter tabs, and pagination controls with zero backend API integration.

---

## 2. Practice.jsx Element Inventory

| Element / Component | Purpose | Current Data Source | Hardcoded Value? | Static UI? | Backend-Driven? | Required? | Recommended Action |
|---------------------|---------|---------------------|------------------|------------|-----------------|-----------|--------------------|
| Page Hero Title | Display page title ("Practice") | Hardcoded string | Yes | Yes | No | Required | Keep as static UI label |
| Page Hero Subtitle | Display practice description | Hardcoded string | Yes | Yes | No | Required | Keep as static UI label |
| Quote & Illustration | Inspirational banner | Hardcoded UI | Yes | Yes | No | Optional | Remove or streamline |
| Total Problems Metric | Show total problem count | Hardcoded "120" | Yes | No | Yes | Required | Drive from `/api/student/problems` |
| Solved Problems Metric | Show solved problem count | Hardcoded "48" (40%) | Yes | No | Yes | Required | Drive from student submission aggregates |
| Remaining Problems Metric | Show remaining problem count | Hardcoded "72" (60%) | Yes | No | Yes | Required | Drive from `Total - Solved` |
| Difficulty Filter Tabs | Filter by All, Easy, Medium, Hard | Hardcoded buttons | Yes | Yes | No | Required | Keep UI, hook up filter state |
| Topic Filter Dropdown | Filter by topic | Static select | Yes | Yes | No | Optional | Populate from problem topics or remove |
| Status Filter Dropdown | Filter by status (Solved/Attempted) | Static select | Yes | Yes | No | Required | Hook up to student progress status |
| Language Filter Dropdown | Filter by language | Static select | Yes | Yes | No | Optional | Populate from allowed languages |
| Problem Table List | Display practice problems | Hardcoded array of 8 objects | Yes | No | Yes | Required | Replace with live API response from `/api/student/problems` |
| Problem Status Badge | Show Solved / Attempted / Not Started | Hardcoded item property | Yes | No | Yes | Required | Map from student submission records |
| Problem Title & Desc | Problem name and summary | Hardcoded item property | Yes | No | Yes | Required | Map from `Problem` model (`title`, `description`) |
| Topic Tag | Problem topic tag | Hardcoded item property | Yes | No | Yes | Optional | Map from problem model / schema |
| Difficulty Tag | Problem difficulty badge | Hardcoded item property | Yes | No | Yes | Required | Map from `Problem.difficulty` (`EASY`, `MEDIUM`, `HARD`) |
| Solved By Metric | Percentage of students solved | Hardcoded percentage + mini-bar | Yes | No | Yes | Optional | Derive from submission success stats or omit |
| Practice Action Button | Navigate to problem detail/editor | Static button | Yes | Yes | No | Required | Wire `onClick` to navigate to `/student/problems/:id` |
| Pagination Footer | Page navigation controls | Static buttons (1-15) | Yes | Yes | No | Optional | Replace with dynamic pagination or infinite scroll / load more |

---

## 3. Hardcoded / Predefined Values
- **Total Problems**: `"120"`
- **Solved Problems**: `"48"` (`40%`)
- **Remaining Problems**: `"72"` (`60%`)
- **Hardcoded Problems Array**: 8 objects (`Two Sum`, `Reverse a Number`, `Palindrome String`, `Array Rotation`, `Factorial`, `Fibonacci Series`, `Find Maximum Element`, `Valid Parentheses`) with fixed topics, difficulties, and solved percentages.
- **Pagination**: Static page buttons (`1` to `15`).

---

## 4. Static vs Dynamic Values
- **Static UI Text**: Page headers, table column headers (`#`, `Status`, `Problem`, `Topic`, `Difficulty`, `Action`), button labels (`Practice →`, `All Problems`, `Easy`, `Medium`, `Hard`).
- **Dynamic Backend Data**: Problem titles, descriptions, difficulty levels, scopes, batches, student submission progress (`SOLVED`, `ATTEMPTED`, `NOT_STARTED`), and aggregate metrics.
- **Derived Frontend Values**: Progress percentages calculated from total vs. solved problem counts.

---

## 5. Current API Usage
- **Practice currently has no backend data source.** It does not import or call any API functions from `frontend/src/api/student.js`.

---

## 6. Backend Source of Truth
The existing backend models serve as the authoritative source of truth:
- **`Problem` model (`backend/src/models/Problem.js`)**: Stores problem title, slug, description, difficulty (`EASY`, `MEDIUM`, `HARD`), constraints, input/output formats, allowed languages, scope (`GLOBAL` or `BATCH`), batch reference, status (`PUBLISHED`), and starter code.
- **`Submission` model (`backend/src/models/Submission.js`)**: Stores student submissions, verdicts (`ACCEPTED`, `WRONG_ANSWER`, `COMPILATION_ERROR`, etc.), runtime, memory, and timestamps.
- **`BatchStudent` model (`backend/src/models/BatchStudent.js`)**: Tracks student batch enrollments, determining which batch-scoped problems are accessible.

---

## 7. Existing Backend Data Available
| Data | Exists Backend? | Source Model | Existing Endpoint | Can Practice Use It? |
|------|-----------------|--------------|-------------------|----------------------|
| List of visible problems with student progress | Yes | `Problem`, `Submission`, `BatchStudent` | `GET /api/student/problems` | Yes (Primary source for Practice table) |
| Student dashboard metrics & summary | Yes | `User`, `BatchStudent`, `Submission`, `Problem` | `GET /api/student/dashboard` | Yes (Can supply summary metrics) |
| Student submission history | Yes | `Submission` | `GET /api/student/submissions` | Yes |

---

## 8. Missing Backend Data
- A dedicated aggregate endpoint specifically computing global vs. batch practice problem counts and filtered difficulty breakdown (though this can be fully computed client-side from the existing `GET /api/student/problems` response or supplied via dashboard metrics).

---

## 9. Required Practice UI Elements
1. Page Header (`Practice` title & subtitle)
2. Summary Metrics Bar (Total Problems, Solved, Remaining/Unsolved with progress bars)
3. Filter Toolbar (Difficulty tabs: All, Easy, Medium, Hard; Status dropdown)
4. Problem List Table / Cards
   - Problem number / ID
   - Status badge (`Solved`, `Attempted`, `Not Started`)
   - Problem title and description snippet
   - Difficulty tag (`Easy`, `Medium`, `Hard`)
   - Action button (`Practice →`) navigating to `/student/problems/:id`
5. Loading state, Empty state, and Error state

---

## 10. Optional UI Elements
- Topic filter dropdown and topic tags (can be added if topic metadata is included in the problem schema)
- Solved By success rate percentage bar
- Pagination / infinite scroll

---

## 11. Elements That Should Be Removed
- Hardcoded mock problem array (`Two Sum`, `Reverse a Number`, etc. hardcoded in component state)
- Static mock metrics (`120`, `48`, `72`)
- Static mock pagination buttons (`1` through `15`)

---

## 12. Proposed Backend → Frontend Data Contract
Practice should leverage the existing robust endpoint:
- **`GET /api/student/problems`**

**Response Structure (Existing):**
```json
{
  "success": true,
  "data": [
    {
      "id": "60d0fe4f5311236168a109ca",
      "title": "Two Sum",
      "slug": "two-sum",
      "description": "Find two numbers that add up to a target value.",
      "difficulty": "EASY",
      "scope": "GLOBAL",
      "batch": null,
      "status": "PUBLISHED",
      "progress": "SOLVED"
    }
  ]
}
```

---

## 13. Field Ownership
- **Problem Title, Description, Difficulty, Scope**: Owned by `Problem` model (`backend/src/models/Problem.js`).
- **Student Progress (`SOLVED`, `ATTEMPTED`, `NOT_STARTED`)**: Derived dynamically on the backend by querying `Submission` records for the authenticated student.
- **Metric Totals (Total, Solved, Remaining)**: Calculated on frontend from the problem list array returned by `GET /api/student/problems`.
- **Display Labels & Formatting**: Owned by frontend components.

---

## 14. CSS Audit
- **Current Structure**: `Practice.css` contains clean scoped styles for container, hero banner, metrics row, filter bar, table card, badges, tags, and pagination.
- **Good**: Uses modern flexbox/grid layout, consistent border-radius (`16px`/`20px`), soft shadows, and clean typography (`Plus Jakarta Sans`).
- **Problems**:
  - Global `body` styles injected inside `Practice.css` (`body { margin: 0; font-family: ... }`) which can conflict with global application styles.
  - Hardcoded color codes (`#e11d48`, `#2563eb`, `#16a34a`) instead of referencing design tokens (`tokens.css`).
  - Overflow and fixed max-width constraints may need alignment with `AppShell` main container padding.

---

## 15. Responsive Audit
- Table wrapper includes `overflow-x: auto` for horizontal scrolling on smaller screens.
- Hero metrics row uses `grid-template-columns: repeat(3, 1fr)` which needs media queries for mobile stacking (`1fr` on mobile viewports).

---

## 16. Accessibility Audit
- Interactive table action buttons lack explicit `aria-label` attributes.
- Filter tabs (`.d-tab`) should support keyboard navigation and `aria-pressed` states.

---

## 17. Routing Audit
- **Canonical Route**: `/student/practice`
- **Registered in**: `AppRoutes.jsx` under `/student/*` protected route.
- **Navigation Item**: Linked in student sidebar / navigation components.

---

## 18. Backend Gap Analysis
- **Already available**: Complete problem listing with student progress (`GET /api/student/problems`), problem details (`GET /api/student/problems/:problemId`), and execution/submission endpoints.
- **Missing**: None. The backend already provides all necessary data via existing student endpoints.

---

## 19. Recommended Implementation Order
- **PHASE A**: Connect `Practice.jsx` to `getStudentProblems()` from `frontend/src/api/student.js`.
- **PHASE B**: Replace hardcoded mock array and static metrics with live API data and derived counts.
- **PHASE C**: Implement filtering (Difficulty tabs & Status select) and search/pagination over live data.
- **PHASE D**: Add loading spinner, empty states, and error handling banners.
- **PHASE E**: Clean up CSS (remove global body overrides, align with design tokens).
- **PHASE F**: Responsive and accessibility validation.
- **PHASE G**: Testing and verification.

---

## 20. Final Recommendation
- **What Practice.jsx should display**: Live list of published global and batch-scoped coding problems accessible to the student, accompanied by real-time progress metrics (Total, Solved, Remaining).
- **What data must come from backend**: Problem records (`title`, `description`, `difficulty`, `scope`, `id`) and student submission progress (`SOLVED`, `ATTEMPTED`, `NOT_STARTED`).
- **What values can remain static**: Section headings, table headers, static UI labels, and button text.
- **Which API already exists**: `GET /api/student/problems`.
- **Which API needs to be created**: None required.
- **Which backend models are the source of truth**: `Problem`, `Submission`, and `BatchStudent`.
- **Which current elements should be removed**: Hardcoded mock array of 8 static problems and static metric numbers.
- **Which current elements should be kept**: Hero layout structure, metric cards container, filter toolbar, and table UI skeleton.
