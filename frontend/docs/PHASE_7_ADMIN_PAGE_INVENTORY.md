# Phase 7.1 — Admin Page Inventory Report

This document inventories all Admin pages in the BTech Coding Platform frontend, documenting routes, components, layout structure, features, API integrations, and UI states.

---

## Inventory Summary

| Page Name | Route | Component File | Description |
|---|---|---|---|
| Admin Dashboard | `/admin` | `src/pages/admin/Index.jsx` | KPI stats, recent batches overview |
| Trainers | `/admin/trainers` | `src/pages/admin/Trainers.jsx` | List & management of trainers |
| Trainer Details | `/admin/trainers/:id` | `src/pages/admin/TrainerDetails.jsx` | Individual trainer details & stats |
| Students | `/admin/students` | `src/pages/admin/Students.jsx` | Student management |
| Batches | `/admin/batches` | `src/pages/admin/Batches.jsx` | Batch management |
| Users | `/admin/users` | `src/pages/admin/Users.jsx` | User account management |
| Problems List | `/admin/problems` | `src/pages/admin/ProblemsList.jsx` | Coding problems listing |
| Problem Editor | `/admin/problems/create`, `:problemId`, etc. | `src/pages/admin/ProblemEditor.jsx` | Create/edit problems and testcases |
| Test Cases List | `/admin/problems/:problemId/testcases` | `src/pages/admin/TestCasesList.jsx` | Testcase management per problem |
| Reports | `/admin/reports` | `src/pages/admin/Reports.jsx` | System/analytics reporting |
| Submissions List | `/admin/submissions` | `src/pages/admin/SubmissionsList.jsx` | All code submissions listing |
| Submission Detail | `/admin/submissions/:id` | `src/pages/admin/SubmissionDetail.jsx` | Detailed submission view & execution logs |
| Settings | `/admin/settings` | `src/pages/admin/Settings.jsx` | System & platform settings |
| System Health | `/admin/system-health` | `src/pages/admin/SystemHealth.jsx` | Server & database health monitoring |

---

## Detailed Page Breakdown

### 1. Admin Dashboard (`/admin`)
- **Component**: `src/pages/admin/Index.jsx`
- **Layout**: Container with PageHeader, welcome greeting, KPI grid (Trainers, Batches), and DataTable for recent batches.
- **API Calls**: `getTrainers()`, `getBatches()` from `src/api/admin.js`.
- **States**: Loading skeletons, error cards, empty states.

### 2. Trainers (`/admin/trainers`)
- **Component**: `src/pages/admin/Trainers.jsx`
- **Layout**: Table view with header actions to add/manage trainers.
- **API Calls**: `getTrainers()`, trainer management endpoints.

### 3. Students (`/admin/students`)
- **Component**: `src/pages/admin/Students.jsx`
- **Layout**: Student listing and filtering table.
- **API Calls**: Student management endpoints.

### 4. Batches (`/admin/batches`)
- **Component**: `src/pages/admin/Batches.jsx`
- **Layout**: Batch listing with creation and management controls.
- **API Calls**: Batch management endpoints.

### 5. Users (`/admin/users`)
- **Component**: `src/pages/admin/Users.jsx`
- **Layout**: User management table across roles.
- **API Calls**: User management API.

### 6. Problems (`/admin/problems`)
- **Component**: `src/pages/admin/ProblemsList.jsx` & `ProblemEditor.jsx`
- **Layout**: Problem table with filter/search, editor form for problem creation and testcases.
- **API Calls**: Problem CRUD APIs.

### 7. Submissions (`/admin/submissions`)
- **Component**: `src/pages/admin/SubmissionsList.jsx` & `SubmissionDetail.jsx`
- **Layout**: Submissions table and detailed view with status badges and execution output.
- **API Calls**: Submission listing and detail APIs.

### 8. System Health (`/admin/system-health`)
- **Component**: `src/pages/admin/SystemHealth.jsx`
- **Layout**: Status cards and metrics monitoring.
- **API Calls**: System health endpoints.

---

## Reusable Opportunities Identified
- Standardized page header banner component with breadcrumbs/eyebrow and primary actions.
- Unified table wrapper with consistent spacing and row height (44–52px).
- Reusable empty state and error banner components.
- Consistent form field wrappers with inline validation support.
