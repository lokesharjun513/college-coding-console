# Student Free Console Implementation Guide

## Overview
The Student Free Console provides students with a dedicated environment to write and execute raw C/GCC 15 code interactively without being constrained by specific problem test cases.

## Architecture
1. **Backend Route**: `POST /api/student/console/run`
   - Authenticated via JWT (`authenticateToken`).
   - Role-restricted to `STUDENT` (`requireRole(['STUDENT'])`).
   - Rate-limited via `consoleLimiter`.
   - Validates request payload (`language === 'c'`, `code` present and under 50KB).
   - Executes code via `onlinecompiler.io` synchronous run API with AbortController timeout (10 seconds).

2. **Frontend Page**: `frontend/src/pages/student/FreeConsole.jsx`
   - Modern, Apple-inspired developer interface.
   - Dual-pane layout: Left pane for source editor (`main.c`) and `stdin`, right pane for execution output, compilation errors, status badge, execution time, and memory usage.
   - Integrated into the student sidebar navigation under "Learning" with a code/terminal icon.

## Environment Variables
- `ONLINE_COMPILER_URL`: Base URL for the online compiler API (e.g., `https://api.onlinecompiler.io`).
- `ONLINE_COMPILER_API_KEY`: API key for authentication with the online compiler service.
