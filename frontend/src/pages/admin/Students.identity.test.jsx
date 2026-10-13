// Focused checks for the Admin Students identity cell layout:
// avatar on the left, name immediately beside it, left aligned, vertically
// centred, and safe on narrow screens.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Students from './Students';
import { getStudents, updateStudent } from '../../api/admin';

vi.mock('../../api/admin', () => ({
  getStudents: vi.fn(),
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
  deleteStudent: vi.fn(),
  downloadStudentTemplate: vi.fn(),
}));

const student = (overrides = {}) => ({
  _id: 'student-doc-1',
  studentId: 'student-doc-1',
  userId: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  rollNumber: 'R001',
  department: 'CSE',
  section: 'A',
  status: 'ACTIVE',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  getStudents.mockResolvedValue({ data: { success: true, data: [student()] } });
  updateStudent.mockResolvedValue({ data: { success: true, data: student({ status: 'INACTIVE' }) } });
});

const identityCell = () => screen.getByText('Ada Lovelace').closest('td');
const identityRow = () => screen.getByText('Ada Lovelace').closest('.admin-students__student');

/** Flattened list of every rule, descending into @media blocks. */
const allRules = () => {
  const out = [];
  const walk = (rules, mediaText) => {
    for (const rule of Array.from(rules || [])) {
      const condition = rule.conditionText || rule.media?.mediaText || mediaText;
      if (rule.cssRules && !rule.selectorText) walk(rule.cssRules, condition);
      else out.push({ rule, mediaText: condition });
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { walk(sheet.cssRules); } catch { /* unreadable sheet */ }
  }
  return out;
};

/** Reads a resolved length from the stylesheet for a given selector+property. */
const stylesheetRuleFor = (selector, property) => {
  for (const { rule } of allRules()) {
    if (rule.selectorText === selector && rule.style?.getPropertyValue(property)) {
      return rule.style.getPropertyValue(property).trim();
    }
  }
  return null;
};

test('the identity row uses the shared admin avatar classes', async () => {
  render(<MemoryRouter><Students /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  const avatar = within(identityCell()).getByText('AL');
  expect(avatar).toHaveClass('admin-avatar');
  expect(avatar).toHaveClass('admin-avatar--student');

  const row = identityRow();
  expect(row.querySelector('.admin-avatar')).toBe(avatar);
  // Name sits to the right of the avatar in DOM order.
  expect(row.firstElementChild).toBe(avatar);
  expect(within(row).getByText('Ada Lovelace')).toBeInTheDocument();
});

test('the identity row is left aligned so the name stays beside the avatar', async () => {
  render(<MemoryRouter><Students /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  const row = identityRow();
  // The table cell centres its text; the row must reset that so the name does
  // not drift into the middle of the flex:1 info column.
  expect(stylesheetRuleFor('.admin-students__student', 'text-align')).toBe('left');
  expect(row).toHaveStyle({ textAlign: 'left' });
});

test('the avatar/name gap is 8-12px and the row is vertically centred', async () => {
  render(<MemoryRouter><Students /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  const row = identityRow();

  // The gap is declared with the shared spacing token; resolve it to pixels so
  // the assertion is real rather than a tautology.
  const declaration = stylesheetRuleFor('.admin-students__student', 'gap');
  expect(declaration).toBeTruthy();

  const token = declaration.match(/var\((--space-\d+)/)?.[1];
  const fallback = Number.parseInt(declaration.match(/,\s*(\d+)px\)/)?.[1] ?? '', 10);
  let gapPx = Number.isNaN(fallback) ? NaN : fallback;
  if (token) {
    const resolved = stylesheetRuleFor(':root', token)
      ?? allRules().find(({ rule }) => rule.style?.getPropertyValue(token))?.rule.style.getPropertyValue(token);
    if (resolved) gapPx = Number.parseInt(resolved.trim(), 10);
  }

  expect(gapPx).toBeGreaterThanOrEqual(8);
  expect(gapPx).toBeLessThanOrEqual(12);

  expect(stylesheetRuleFor('.admin-students__student', 'display')).toBe('flex');
  expect(stylesheetRuleFor('.admin-students__student', 'align-items')).toBe('center');
  expect(row).toHaveStyle({ display: 'flex', alignItems: 'center' });
});

test('the info column keeps the name hard against the avatar', async () => {
  render(<MemoryRouter><Students /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  // text-align is inherited, so the name span must not re-centre.
  const nameSpan = screen.getByText('Ada Lovelace');
  const style = window.getComputedStyle(nameSpan);
  expect(style.textAlign === '' || style.textAlign === 'start' || style.textAlign === 'left').toBe(true);
});

test('the identity row does not wrap and may shrink on narrow screens', async () => {
  render(<MemoryRouter><Students /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  expect(stylesheetRuleFor('.admin-students__student', 'flex-wrap')).toBe('nowrap');
  // A media query overrides min-width and tightens the gap on narrow screens.
  const mobileRule = allRules().find(({ rule, mediaText }) =>
    mediaText?.includes('767px')
    && rule.selectorText === '.admin-students__student'
    && rule.style?.getPropertyValue('min-width'));
  expect(mobileRule).toBeDefined();
  expect(mobileRule.rule.style.getPropertyValue('min-width')).toBe('0');
});

test('a very long student name still renders inside the identity cell', async () => {
  getStudents.mockResolvedValue({
    data: {
      success: true,
      data: [student({ name: 'Bartholomew Winchester-Abernathy the Third', rollNumber: 'R002' })],
    },
  });
  render(<MemoryRouter><Students /></MemoryRouter>);

  await waitFor(() => expect(screen.getByText('Bartholomew Winchester-Abernathy the Third')).toBeInTheDocument());
  const cell = screen.getByText('Bartholomew Winchester-Abernathy the Third').closest('td');
  expect(cell.querySelector('.admin-avatar')).not.toBeNull();
  // Still no duplicate Student ID line under the name.
  expect(within(cell).queryByText(/^ID:/)).not.toBeInTheDocument();
});