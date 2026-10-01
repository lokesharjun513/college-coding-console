# RESPONSIVE_SHELL_REFACTOR_AUDIT

## 1. Current Shell Architecture
The application currently uses a centralized `SaasLayout` component which wraps the content in `AdminLayout`, `TrainerLayout`, and `StudentLayout`.
`SaasLayout` renders the `Header`, `Sidebar`, `MobileHeader`, `MobileNavigation`, and `MoreSheet` components globally.

## 2. Admin Shell
`AdminLayout` uses `SaasLayout`.

## 3. Trainer Shell
`TrainerLayout` uses `SaasLayout`.

## 4. Student Shell
`StudentLayout` uses `SaasLayout`.

## 5. Header Locations
- `src/components/navigation/Header.jsx` (Desktop Header)
- `src/components/common/SaasLayout.jsx` (Rendered via `SaasLayout`)

## 6. Sidebar Locations
- `src/components/ui/sidebar/Sidebar.jsx`
- `src/components/common/SaasLayout.jsx` (Rendered via `SaasLayout`)

## 7. Mobile Header Locations
- `src/components/common/SaasLayout.jsx` (Rendered via inline JSX)

## 8. Bottom Navigation Locations
- `src/components/navigation/MobileNavigation.jsx`
- `src/components/common/SaasLayout.jsx` (Rendered via `SaasLayout`)

## 9. Duplicate Navigation Components
None identified in search.

## 10. Page Components Incorrectly Owning Shell Elements
None identified in initial search of page components.

## 11. CSS Causing Overlap
*Pending investigation.*

## 12. CSS Causing Header to Behave Like Page Content
*Pending investigation.*

## 13. CSS Causing Bottom Navigation Overlap
*Pending investigation.*

## 14. Recommended Final Architecture
- Maintain `SaasLayout` as the single source of truth for all shell components.
- Ensure all layout files use `SaasLayout`.
- Refactor CSS to use the flexbox architecture proposed in the requirements.
- Add `layoutMode` support to `SaasLayout` for `fullscreen` vs `natural` content.

## 15. Files to Modify
- `src/styles/SaasLayout.css` (Update flexbox rules)
- `src/components/common/SaasLayout.jsx` (Ensure workspace mode support)

## 16. Files to Remove/Refactor
- Clean up any legacy `AppShell` references (already largely done, double check).

## 17. Risks
- Workspace pages (e.g., Free Console) might break if the shell layout changes their container height or structure.
