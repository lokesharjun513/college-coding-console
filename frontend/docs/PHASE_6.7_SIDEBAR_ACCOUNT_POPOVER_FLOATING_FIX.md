# Phase 6.7 – Sidebar Account Popover Floating Overlay Fix

## Goal
Make the account popover render as a true floating overlay, outside the sidebar, without being clipped or affecting layout.

## Root Cause
`SidebarAccount.jsx` rendered the popover as a regular DOM child inside the sidebar. The sidebar (`.sidebar`) has `overflow: hidden`, which clipped the popover when it extended beyond the sidebar width.

## Architecture
- **Portal** – The popover is now rendered with `ReactDOM.createPortal` into `document.body`.
- **Positioning** – When the popover opens, we compute the trigger button’s bounding rectangle and set the popover style to `position: fixed` with `left = rect.right + 8px` and `top = rect.top`. This anchors the overlay to the trigger while keeping it outside the sidebar.
- **Z‑Index** – Uses the existing `var(--z-modal)` token (≈600) to appear above the sidebar, header, and page content.
- **Styling** – Updated `.sidebar__account-popover` to `position: fixed` and removed the left/bottom rules that tied it to the sidebar.
- **Accessibility** – Click‑outside detection and Escape‑key handling remain unchanged. Focus‑visible outlines are preserved.
- **Reduced Motion** – The existing `prefers-reduced-motion` media query disables the popover animation when needed.

## Implementation Details
### `src/components/ui/sidebar/SidebarAccount.jsx`
- Added `createPortal` import.
- Introduced `popoverStyle` state and a `useEffect` that computes the fixed position when `open` changes.
- Wrapped the popover JSX in `createPortal(..., document.body)`.
- Updated imports accordingly.

### `src/styles/sidebarAccount.css`
- Changed `.sidebar__account-popover` to `position: fixed` and removed `left`/`bottom` rules.
- Kept visual design (glass background, border, radius, shadow, animation).
- Set `z-index: var(--z-modal)` for proper stacking.

## Responsive & Interaction Behaviour
- **Expanded & Collapsed Sidebar** – The popover always opens to the right of the avatar/button, regardless of sidebar width.
- **Hover / Active** – Unchanged; the popover’s own hover styles remain.
- **Keyboard** – Escape key closes the popover; focus stays on the trigger when open.
- **Viewport Changes** – Re‑calculates position on each open, so resizing while open re‑positions correctly on next open.
- **Scroll** – The popover is independent; the sidebar does not gain a scrollbar.

## Verification
- **Build**: `npm run build` succeeds.
- **Tests**: `npm test` passes (no test failures introduced).
- **Lint**: `npm run lint` passes.
- **Manual Checks** (performed locally):
  - Expanded sidebar: popover appears to the right, floats above content, no clipping.
  - Collapsed sidebar: same behavior, anchored to the small avatar.
  - Window resize: popover re‑positions correctly on next open.
  - Scroll page: popover remains fixed relative to the trigger.
  - Escape key / click outside: popover closes.
  - Focus outline visible on trigger.

## Remaining Work
None – the popover now behaves as a floating overlay while preserving all existing functionality and design.
