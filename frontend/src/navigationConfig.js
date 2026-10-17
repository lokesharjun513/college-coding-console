// Navigation configuration for role‑aware sidebar
// Each role gets its own set of sections and items.
// Icon names correspond to the simple Icon component (see src/components/ui/Icon.jsx)
//
// `primary: true` marks an item as belonging in the mobile bottom bar and
// excludes it from the More sheet. Roles that do not use the flag fall back to
// the legacy "first N items" behaviour (see getPrimaryItems/getOverflowItems),
// so ADMIN and TRAINER mobile navigation is unchanged — including their More
// sheet. STUDENT marks all five of its items, so it gets exactly those five in
// the bottom bar and an empty overflow.
//
// `shortLabel` is the compact label used by the bottom bar, where five items
// share a 360px-wide bar and full labels would truncate.

/** Legacy bottom-bar width used by roles that declare no `primary` items. */
export const LEGACY_PRIMARY_COUNT = 4;

const flatten = (sections = []) => sections.flatMap((section) => section.items || []);

/** Items shown directly in the mobile bottom bar. */
export function getPrimaryItems(sections) {
  const all = flatten(sections);
  const marked = all.filter((item) => item.primary);
  return marked.length ? marked : all.slice(0, LEGACY_PRIMARY_COUNT);
}

/** Items moved into the More sheet — always the exact complement of the above. */
export function getOverflowItems(sections) {
  const all = flatten(sections);
  const marked = all.filter((item) => item.primary);
  if (!marked.length) return all.slice(LEGACY_PRIMARY_COUNT);
  const primaryPaths = new Set(marked.map((item) => item.path));
  return all.filter((item) => !primaryPaths.has(item.path));
}

/**
 * Active-route test used by the sidebar and the More sheet.
 * A section root only matches exactly, so /student never stays lit while the
 * student is on /student/problems.
 */
export function isActivePath(pathname, path) {
  const isRoot = path === '/admin' || path === '/trainer' || path === '/student';
  return isRoot ? pathname === path : pathname === path || pathname.startsWith(path + '/');
}

export const navigationConfig = {
  ADMIN: [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', path: '/admin', icon: 'home' },
        { label: 'Reports', path: '/admin/reports', icon: 'barChart' },
      ],
    },
    {
      label: 'Management',
      items: [
        { label: 'Users', path: '/admin/users', icon: 'users' },
        { label: 'Trainers', path: '/admin/trainers', icon: 'userCheck' },
        { label: 'Students', path: '/admin/students', icon: 'user' },
        { label: 'Batches', path: '/admin/batches', icon: 'layers' },
         { label: 'Problems', path: '/admin/problems', icon: 'fileCode' },
         { label: 'Global Leaderboard', path: '/admin/submissions', icon: 'trophy' },
         { label: 'Compiler Keys', path: '/admin/compiler-keys', icon: 'key' },
      ],
    },
    {
      label: 'System',
      items: [
        { label: 'System Health', path: '/admin/system-health', icon: 'chartLine' },
      ],
    },
  ],
  TRAINER: [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', path: '/trainer', icon: 'home' },
        { label: 'Batches', path: '/trainer/batches', icon: 'layers' },
        { label: 'Problems', path: '/trainer/problems', icon: 'fileCode' },
        { label: 'Analytics', path: '/trainer/analytics', icon: 'chartBar' },
        { label: 'Leaderboard', path: '/trainer/leaderboard', icon: 'trophy' },
      ],
    },
  ],
  // Student navigation: exactly five destinations, in the order the product
  // defines, and nothing else.
  //
  // "Stats" points at /student/performance — the only registered student
  // analytics route. There is no /student/stats, and none is invented here.
  //
  // My Batch and Leaderboard are deliberately absent. The pages, their routes
  // and their APIs all still exist and are still reachable by URL (and the
  // Student Dashboard still links to My Batch in its own content); what is gone
  // is only their navigation entry. Because there is no sixth item there is
  // also nothing to overflow, so Students get no More sheet on mobile — the
  // sheet renders nothing rather than an empty list.
  STUDENT: [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', shortLabel: 'Home', path: '/student', icon: 'home', primary: true },
        { label: 'Problems', shortLabel: 'Problems', path: '/student/problems', icon: 'fileCode', primary: true },
        { label: 'Practice', shortLabel: 'Practice', path: '/student/practice', icon: 'notebook', primary: true },
        // This slot now opens the OneCompiler editor route, not the old Free
        // Console sandbox: label "Console", short label "Console".
        { label: 'Console', shortLabel: 'Console', path: '/student/onecompiler', icon: 'code', primary: true },
        { label: 'Stats', shortLabel: 'Stats', path: '/student/performance', icon: 'chartBar', primary: true },
      ],
    },
  ],
};
