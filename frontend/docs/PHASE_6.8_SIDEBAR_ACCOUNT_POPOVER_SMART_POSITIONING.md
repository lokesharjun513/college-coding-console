# Phase 6.8 – Sidebar Account Popover Smart Viewport Positioning

## Goal
Implement intelligent viewport-aware positioning for the account popover so it never extends outside the viewport and adapts to available space.

---

## Implementation Summary

### 1. Positioning Algorithm
- **Measure trigger and viewport**: On open, we capture the trigger button's bounding rectangle and available viewport dimensions.
- **Horizontal positioning**: 
  - Default: `left = triggerRect.right + 8px`
  - If this would overflow the right edge, clamp to: `left = viewportWidth - popoverWidth - 12px`
- **Vertical positioning**:
  - Calculate available space above (`triggerRect.top`) and below (`viewportHeight - triggerRect.bottom`)
  - Preferred placement: **upward** (above trigger) because account is normally at bottom of sidebar
  - If opening upward: `top = triggerRect.top - popoverHeight - 8px`
  - If opening downward: `top = triggerRect.top`
  - Clamp to viewport: `top = max(12px, min(top, viewportHeight - popoverHeight - 12px))`
- **Resize listener**: Recalculates position on window resize while popover is open.

### 2. Files Modified

| File | Changes |
|------|---------|
| `src/components/ui/sidebar/SidebarAccount.jsx` | Added `calculatePopoverPosition()` callback, resize listener, and `useCallback` import |
| `src/styles/sidebarAccount.css` | Updated popover surface, width, animations, menu item styling |

### 3. Visual Changes
- **Popover width**: Fixed to `260px` (max `calc(100vw - 24px)`)
- **Surface**: `background: rgba(255,255,255,0.96)`, `backdrop-filter: blur(16px)`, subtle border and shadow
- **Menu items**: Compact `height: 40px`, `padding: 0 10px`, `border-radius: 8px`
- **Divider**: Cleaner `rgba(15,36,65,0.08)` stroke
- **Animations**: Different entrance direction based on placement (`popover-fade-in` vs `popover-fade-in-up`)

---

## Acceptance Tests

### A. Desktop Expanded Sidebar
- **Trigger**: Bottom-left area of sidebar
- **Expected**: Popover opens to the right of sidebar and above trigger

### B. Desktop Collapsed Sidebar
- **Trigger**: Centered in 72px rail
- **Expected**: Popover opens to the right of collapsed rail and above trigger

### C. Small Viewport
- **Expected**: Popover clamps to viewport edges (12px minimum from all edges)

### D. Window Resize
- **Expected**: Popover recalculates position on resize

### E. Escape / Click Outside
- **Expected**: Popover closes as before

### F. Keyboard Navigation
- **Expected**: Focus remains accessible

---

## Verification

- **Build**: `npm run build` – PASSING
- **Tests**: `npm test` – PASSING
- **Lint**: `npm run lint` – PASSING

---

## Remaining Issues
None. All positioning, viewport, and styling requirements met.
