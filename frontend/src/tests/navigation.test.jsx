// Tests for Student navigation: the role configuration, the shared
// primary/overflow split that both the bottom bar and the More sheet depend on,
// and the rendered Sidebar / MobileNavigation / MoreSheet components.
//
// The product requirement pinned here is exact: a Student has FIVE navigation
// destinations — Dashboard, Problems, Practice, Console, Stats — in that
// order, in the desktop sidebar and in the mobile bottom bar alike, with no
// More button and no overflow sheet. The Console slot opens the OneCompiler
// editor (/student/onecompiler), not the old Free Console sandbox. Everything
// else (Admin, Trainer, their overflow behaviour, the student routes
// themselves) is left alone.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MobileNavigation from '../components/navigation/MobileNavigation';
import MoreSheet from '../components/navigation/MoreSheet';
import Sidebar from '../components/ui/sidebar/Sidebar';
import { SidebarProvider } from '../components/ui/sidebar/SidebarProvider';
import {
  LEGACY_PRIMARY_COUNT,
  getOverflowItems,
  getPrimaryItems,
  isActivePath,
  navigationConfig,
} from '../navigationConfig';

let currentUser = { role: 'STUDENT', name: 'Aditi Ramesh' };

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: currentUser, logout: vi.fn() }),
}));

/** The registered student routes, verbatim from AppRoutes.jsx. */
const REGISTERED_STUDENT_ROUTES = new Set([
  '/student',
  '/student/practice',
  '/student/batch',
  '/student/performance',
  '/student/leaderboard',
  '/student/problems',
  '/student/freeconsole',
  '/student/onecompiler',
  '/student/problems/:id',
]);

const REQUIRED_STUDENT_ITEMS = [
  { label: 'Dashboard', path: '/student' },
  { label: 'Problems', path: '/student/problems' },
  { label: 'Practice', path: '/student/practice' },
  { label: 'Console', path: '/student/onecompiler' },
  { label: 'Stats', path: '/student/performance' },
];

const studentPrimary = getPrimaryItems(navigationConfig.STUDENT);
const studentAll = navigationConfig.STUDENT.flatMap((section) => section.items);

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { role: 'STUDENT', name: 'Aditi Ramesh' };
});

/* ── configuration ──────────────────────────────────────────────────── */

test('Student navigation contains exactly five items', () => {
  expect(studentAll).toHaveLength(5);
  expect(studentPrimary).toHaveLength(5);
  expect(getOverflowItems(navigationConfig.STUDENT)).toHaveLength(0);
});

test('the five Student items are Dashboard, Problems, Practice, Console, Stats — in order', () => {
  expect(studentPrimary.map((item) => item.label)).toEqual([
    'Dashboard',
    'Problems',
    'Practice',
    'Console',
    'Stats',
  ]);
  expect(studentPrimary.map((item) => item.path)).toEqual([
    '/student',
    '/student/problems',
    '/student/practice',
    '/student/onecompiler',
    '/student/performance',
  ]);
});

test('the removed Student destinations are gone from the configuration, not merely hidden', () => {
  const labels = studentAll.map((item) => item.label).map((l) => l.toLowerCase());
  const paths = studentAll.map((item) => item.path);

  expect(labels).not.toContain('my batch');
  expect(labels).not.toContain('batch');
  expect(labels).not.toContain('leaderboard');
  expect(paths).not.toContain('/student/batch');
  expect(paths).not.toContain('/student/leaderboard');

  // No overflow section survives to re-introduce them.
  expect(navigationConfig.STUDENT).toHaveLength(1);
  expect(navigationConfig.STUDENT[0].label).toBe('Main');
});

test('every Student destination points at a registered student route', () => {
  for (const item of studentAll) {
    expect(REGISTERED_STUDENT_ROUTES.has(item.path)).toBe(true);
  }
});

test('Stats maps to /student/performance rather than an invented path', () => {
  const stats = studentPrimary.find((item) => item.label === 'Stats');
  expect(stats.path).toBe('/student/performance');
  expect(stats.path).not.toBe('/student/stats');
});

test('every Student item has an icon, a label and a compact mobile label', () => {
  for (const item of studentPrimary) {
    expect(item.icon).toBeTruthy();
    expect(item.label).toBeTruthy();
    expect(item.shortLabel).toBeTruthy();
  }
});

test('all five Student items are marked primary, so no slice() can drop Problems or Stats', () => {
  // The legacy fallback takes only the first LEGACY_PRIMARY_COUNT items when a
  // role marks none. Marking all five is what makes the bottom bar show exactly
  // the five rather than four.
  expect(studentPrimary).toHaveLength(REQUIRED_STUDENT_ITEMS.length);
  expect(studentPrimary).not.toHaveLength(LEGACY_PRIMARY_COUNT);
  expect(studentAll.every((item) => item.primary === true)).toBe(true);
});

test('no Student destination points at an Admin or Trainer route', () => {
  for (const path of studentAll.map((item) => item.path)) {
    expect(path.startsWith('/admin')).toBe(false);
    expect(path.startsWith('/trainer')).toBe(false);
  }
});

test('Admin and Trainer keep their existing first-four bottom-bar behaviour and overflow', () => {
  for (const role of ['ADMIN', 'TRAINER']) {
    const sections = navigationConfig[role];
    expect(sections.flatMap((s) => s.items).some((i) => i.primary)).toBe(false);

    const bar = getPrimaryItems(sections);
    const overflow = getOverflowItems(sections);
    const all = sections.flatMap((s) => s.items);

    expect(bar).toHaveLength(LEGACY_PRIMARY_COUNT);
    expect(bar.map((i) => i.path)).toEqual(all.slice(0, LEGACY_PRIMARY_COUNT).map((i) => i.path));
    expect(overflow.map((i) => i.path)).toEqual(all.slice(LEGACY_PRIMARY_COUNT).map((i) => i.path));
    expect(overflow.length).toBeGreaterThan(0);
  }
});

test('Admin and Trainer item lists are untouched', () => {
  expect(navigationConfig.ADMIN.flatMap((s) => s.items).map((i) => i.label)).toEqual([
    'Dashboard', 'Reports',
    'Users', 'Trainers', 'Students', 'Batches', 'Problems', 'Global Leaderboard', 'Compiler Keys',
    'System Health',
  ]);
  expect(navigationConfig.TRAINER.flatMap((s) => s.items).map((i) => i.label)).toEqual([
    'Dashboard', 'Batches', 'Problems', 'Analytics', 'Leaderboard',
  ]);
});

/* ── active-route semantics ─────────────────────────────────────────── */

test('a section root only matches exactly, so Dashboard is not lit on a child route', () => {
  expect(isActivePath('/student', '/student')).toBe(true);
  expect(isActivePath('/student/problems', '/student')).toBe(false);
});

test('a parent destination stays active across its child routes', () => {
  expect(isActivePath('/student/problems/42', '/student/problems')).toBe(true);
  expect(isActivePath('/student/onecompiler', '/student/onecompiler')).toBe(true);
  expect(isActivePath('/student/batch', '/student/performance')).toBe(false);
});

/* ── desktop sidebar ────────────────────────────────────────────────── */

const renderSidebar = (path = '/student') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );

const sidebar = () => screen.getByRole('navigation', { name: 'Main navigation', hidden: true });
const sidebarLinks = () => within(sidebar()).getAllByRole('link', { hidden: true });

test('the desktop sidebar shows exactly the five Student destinations', () => {
  renderSidebar();

  const links = sidebarLinks();
  expect(links).toHaveLength(5);
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/student',
    '/student/problems',
    '/student/practice',
    '/student/onecompiler',
    '/student/performance',
  ]);
  expect(links.map((link) => link.textContent.trim())).toEqual([
    'Dashboard',
    'Problems',
    'Practice',
    'Console',
    'Stats',
  ]);
});

test('the desktop sidebar contains no My Batch, Leaderboard or Batch link', () => {
  renderSidebar();

  expect(within(sidebar()).queryByRole('link', { name: /my batch/i, hidden: true })).not.toBeInTheDocument();
  expect(within(sidebar()).queryByRole('link', { name: /leaderboard/i, hidden: true })).not.toBeInTheDocument();
  expect(within(sidebar()).queryByRole('link', { name: /^batch$/i, hidden: true })).not.toBeInTheDocument();
  expect(
    sidebarLinks().some((link) => ['/student/batch', '/student/leaderboard'].includes(link.getAttribute('href')))
  ).toBe(false);
});

test('the desktop sidebar marks the active Student route', () => {
  renderSidebar('/student/performance');

  const current = sidebarLinks().filter((link) => link.getAttribute('aria-current') === 'page');
  expect(current).toHaveLength(1);
  expect(current[0]).toHaveAttribute('href', '/student/performance');
});

/* ── mobile bottom bar ──────────────────────────────────────────────── */

// The bottom bar is display:none above 767px by design, and jsdom's viewport is
// 1024px wide, so these queries opt into hidden elements. Note that the
// accessible-name filter cannot be combined with `hidden` for a display:none
// subtree (the computed name comes back empty), so the aria-label is asserted
// directly instead. Whether the bar is actually painted at each viewport is
// covered by the browser checks.
const renderBar = (path = '/student') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileNavigation onMoreClick={() => {}} isMoreOpen={false} />
    </MemoryRouter>,
  );

const bar = () => screen.getByRole('navigation', { hidden: true });
const barLinks = () => within(bar()).getAllByRole('link', { hidden: true });

test('the bottom bar is a labelled navigation landmark', () => {
  renderBar();
  expect(bar().getAttribute('aria-label')).toBe('Mobile navigation');
});

test('the bottom bar renders exactly the five Student destinations, in order', () => {
  renderBar();

  const links = barLinks();
  expect(links).toHaveLength(5);
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/student',
    '/student/problems',
    '/student/practice',
    '/student/onecompiler',
    '/student/performance',
  ]);
  // The bar uses the compact labels; Problems and Stats are among them.
  expect(
    links.map((link) => link.querySelector('.mobile-nav__label')?.textContent)
  ).toEqual(['Home', 'Problems', 'Practice', 'Console', 'Stats']);
});

test('the bottom bar renders no More button for Students', () => {
  renderBar();

  expect(within(bar()).queryByRole('button', { hidden: true })).not.toBeInTheDocument();
  expect(within(bar()).queryByText('More', { selector: '.mobile-nav__label' })).not.toBeInTheDocument();
  expect(within(bar()).queryByRole('link', { name: 'My Batch', hidden: true })).not.toBeInTheDocument();
  expect(within(bar()).queryByRole('link', { name: 'Leaderboard', hidden: true })).not.toBeInTheDocument();
});

test('the More sheet renders nothing for Students, open or not', () => {
  const { unmount } = render(
    <MemoryRouter initialEntries={['/student']}>
      <MoreSheet isOpen onClose={() => {}} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.queryByText('More')).not.toBeInTheDocument();
  unmount();

  render(
    <MemoryRouter initialEntries={['/student']}>
      <MoreSheet isOpen={false} onClose={() => {}} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test('the active route is exposed with aria-current in the bottom bar', () => {
  renderBar('/student/problems');
  const current = barLinks().filter((link) => link.getAttribute('aria-current') === 'page');

  expect(current).toHaveLength(1);
  expect(current[0]).toHaveTextContent('Problems');
});

/* ── Admin / Trainer mobile navigation is unchanged ─────────────────── */

test('Admin and Trainer still get a More button and an overflow sheet', () => {
  currentUser = { role: 'TRAINER', name: 'Ravi Menon' };
  render(
    <MemoryRouter initialEntries={['/trainer']}>
      <MobileNavigation onMoreClick={() => {}} isMoreOpen={false} />
    </MemoryRouter>,
  );

  expect(within(bar()).getByRole('button', { name: 'More', hidden: true })).toBeInTheDocument();
  expect(barLinks().map((link) => link.getAttribute('href'))).toEqual([
    '/trainer',
    '/trainer/batches',
    '/trainer/problems',
    '/trainer/analytics',
  ]);
});

test('an overflow route marks More as the active destination', () => {
  currentUser = { role: 'TRAINER', name: 'Ravi Menon' };
  render(
    <MemoryRouter initialEntries={['/trainer/leaderboard']}>
      <MobileNavigation onMoreClick={() => {}} isMoreOpen={false} />
    </MemoryRouter>,
  );

  expect(barLinks().filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(0);
  expect(within(bar()).getByRole('button', { name: 'More', hidden: true }).className).toContain(
    'mobile-nav__item--active',
  );
});

test('the More sheet lists exactly the overflow destinations and marks the active one', () => {
  currentUser = { role: 'TRAINER', name: 'Ravi Menon' };
  render(
    <MemoryRouter initialEntries={['/trainer/leaderboard']}>
      <MoreSheet isOpen onClose={() => {}} />
    </MemoryRouter>,
  );

  const items = screen.getAllByRole('link');
  expect(items.map((i) => i.getAttribute('href'))).toEqual(['/trainer/leaderboard']);

  const current = items.filter((i) => i.getAttribute('aria-current') === 'page');
  expect(current).toHaveLength(1);
  expect(current[0]).toHaveTextContent('Leaderboard');
  expect(current[0].className).toContain('more-sheet__item--active');
});