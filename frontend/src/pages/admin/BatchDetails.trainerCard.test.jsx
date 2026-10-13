// Focused checks for the redesigned Trainer Assignment card on the batch
// details page: structure, 48px initials avatar, status pill, action button,
// token usage and preserved behaviour.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminBatchDetails from './BatchDetails';
import { getBatch, getTrainers, updateBatch, getBatchStudents, getStudents } from '../../api/admin';

vi.mock('../../api/admin', () => ({
  getBatch: vi.fn(),
  getTrainers: vi.fn(),
  updateBatch: vi.fn(),
  deleteBatch: vi.fn(),
  getBatchStudents: vi.fn(),
  getStudents: vi.fn(),
  enrollStudent: vi.fn(),
  deleteStudentEnrollment: vi.fn(),
  updateStudentEnrollment: vi.fn(),
}));

const BATCH_ID = 'batch-1';
const TRAINER = { id: 'trainer-1', name: 'Test Trainer', email: 'testtrainer@gmail.com' };

const batchResponse = (trainer) => ({
  data: {
    success: true,
    data: {
      id: BATCH_ID, name: 'CSE 2024', code: 'CSE24', description: 'Core cohort',
      status: 'ACTIVE', startDate: '2024-06-01', endDate: '2028-05-31',
      trainer,
    },
  },
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/admin/batches/${BATCH_ID}`]}>
      <Routes>
        <Route path="/admin/batches/:batchId" element={<AdminBatchDetails />} />
      </Routes>
    </MemoryRouter>
  );
}

const card = async () => {
  renderPage();
  return screen.findByRole('region', { name: /Trainer assignment/i });
};

/** Renders a fresh page with a given trainer and returns the card region. */
const cardFor = async (trainer) => {
  getBatch.mockResolvedValue(batchResponse(trainer));
  renderPage();
  return screen.findByRole('region', { name: /Trainer assignment/i });
};

/** Flattened stylesheet rules, descending into @media blocks. */
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

const ruleFor = (selector, property) => {
  for (const { rule } of allRules()) {
    if (rule.selectorText === selector && rule.style?.getPropertyValue(property)) {
      return rule.style.getPropertyValue(property).trim();
    }
  }
  return null;
};

beforeEach(() => {
  vi.clearAllMocks();
  getBatch.mockResolvedValue(batchResponse(TRAINER));
  getTrainers.mockResolvedValue({ data: { success: true, data: [] } });
  getBatchStudents.mockResolvedValue({ data: { success: true, data: [] } });
  getStudents.mockResolvedValue({ data: { success: true, data: [] } });
  updateBatch.mockResolvedValue({ data: { success: true, data: {} } });
});

// ── Heading ───────────────────────────────────────────────────────────────
test('shows the required heading and subtitle', async () => {
  const region = await card();
  expect(within(region).getByRole('heading', { name: 'Trainer Assignment' })).toBeInTheDocument();
  expect(within(region).getByText('Manage the instructional lead for this batch')).toBeInTheDocument();
});

// ── Trainer identity ───────────────────────────────────────────────────────
test('renders a 48px initials avatar with the shared trainer avatar classes', async () => {
  const region = await card();
  const avatar = within(region).getByText('TT');

  expect(avatar).toHaveClass('admin-avatar');
  expect(avatar).toHaveClass('admin-avatar--trainer');
  expect(avatar).toHaveClass('admin-batch-trainer__avatar');
  // Decorative initials are hidden from assistive tech; the name carries it.
  expect(avatar).toHaveAttribute('aria-hidden', 'true');

  // CSS pins the shared avatar to 48px inside this card.
  const size = ruleFor('.admin-batch-trainer__avatar.admin-avatar', 'width');
  expect(size).toBe('48px');
  expect(ruleFor('.admin-batch-trainer__avatar.admin-avatar', 'height')).toBe('48px');
});

test('shows name above email with muted supporting text', async () => {
  const region = await card();
  expect(within(region).getByText('Test Trainer')).toBeInTheDocument();
  expect(within(region).getByText('testtrainer@gmail.com')).toBeInTheDocument();

  expect(ruleFor('.admin-batch-trainer__name', 'color')).toBe('var(--admin-text-primary)');
  expect(ruleFor('.admin-batch-trainer__name', 'font-weight')).toBe('var(--admin-font-weight-semibold)');
  expect(ruleFor('.admin-batch-trainer__email', 'color')).toBe('var(--admin-text-muted)');
});

test('avatar and text sit 12px apart and align vertically', async () => {
  await card();
  expect(ruleFor('.admin-batch-trainer__identity', 'gap')).toBe('12px');
  expect(ruleFor('.admin-batch-trainer__identity', 'align-items')).toBe('center');
});

test('a very long email wraps instead of overflowing the card', async () => {
  getBatch.mockResolvedValue(batchResponse({
    id: 't1',
    name: 'A Very Long Instructor Name Indeed',
    email: 'an.extremely.long.instructor.address.with.many.parts@example-domain.edu',
  }));
  const region = await card();

  expect(within(region).getByText(/an\.extremely\.long\.instructor\.address/)).toBeInTheDocument();
  expect(ruleFor('.admin-batch-trainer__email', 'overflow-wrap')).toBe('anywhere');
});

// ── Status ─────────────────────────────────────────────────────────────────
test('shows an Assigned status with a green treatment and a dot indicator', async () => {
  const region = await card();
  const status = within(region).getByText('Assigned');

  expect(status).toHaveClass('admin-batch-trainer__status--assigned');
  expect(ruleFor('.admin-batch-trainer__status--assigned', 'background')).toBe('var(--admin-success-bg)');
  expect(ruleFor('.admin-batch-trainer__status--assigned', 'color')).toBe('var(--admin-success-text)');
  // Supplementary dot indicator, alongside the text label.
  expect(ruleFor('.admin-batch-trainer__status', 'width')).toBeNull();
  const css = (await import('../../styles/pages/admin-batch-details.css?raw')).default;
  expect(css).toMatch(/\.admin-batch-trainer__status::before/);
});

test('shows Not Assigned when no trainer is set', async () => {
  const region = await cardFor(null);

  const status = within(region).getByText('Not Assigned');
  expect(status).toHaveClass('admin-batch-trainer__status--unassigned');
  expect(within(region).getByText(/Assign an instructional lead to get started/)).toBeInTheDocument();
  expect(within(region).getByText('No trainer assigned')).toBeInTheDocument();
  // Never colour-only: the label differs between the two states.
  expect(within(region).queryByText('Assigned')).not.toBeInTheDocument();
});

// ── Action button ──────────────────────────────────────────────────────────
test('shows Change Trainer when a trainer is assigned', async () => {
  const region = await cardFor(TRAINER);
  const change = within(region).getByRole('button', { name: 'Change Trainer' });
  expect(change).toHaveClass('admin-batch-trainer__action');
  expect(change.tagName).toBe('BUTTON');
  expect(change).toHaveAttribute('type', 'button');
  // Visible text is the accessible name (no conflicting aria-label).
  expect(change).not.toHaveAttribute('aria-label');
});

test('shows Assign Trainer when no trainer is assigned', async () => {
  const region = await cardFor(null);
  expect(within(region).getByRole('button', { name: 'Assign Trainer' })).toHaveClass('admin-batch-trainer__action');
});

test('the action button opens the existing trainer assignment modal', async () => {
  getTrainers.mockResolvedValue({
    data: { success: true, data: [{ id: 'trainer-2', name: 'Second Trainer', email: 'second@gmail.com' }] },
  });
  const region = await card();
  fireEvent.click(within(region).getByRole('button', { name: 'Change Trainer' }));

  const dialog = await screen.findByRole('dialog', { name: /Change trainer/i });
  expect(dialog).toBeInTheDocument();

  // Existing API behaviour is preserved.
  fireEvent.change(within(dialog).getByLabelText('Trainer'), { target: { value: 'trainer-2' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Assignment/ }));
  await waitFor(() => expect(updateBatch).toHaveBeenCalledWith(BATCH_ID, { trainer: 'trainer-2' }));
});

// ── Card surface ───────────────────────────────────────────────────────────
test('the card uses an 18px radius, delicate border and a soft shadow', async () => {
  await card();
  expect(ruleFor('.admin-batch-trainer', 'border-radius')).toBe('18px');
  expect(ruleFor('.admin-batch-trainer', 'border')).toBe('1px solid var(--admin-border-light)');
  expect(ruleFor('.admin-batch-trainer', 'box-shadow')).toBe('var(--admin-shadow-lg)');
  expect(ruleFor('.admin-batch-trainer', 'background')).toBe('var(--admin-surface)');
});

test('the glass highlight is a single subtle gradient layer', async () => {
  await card();
  const css = (await import('../../styles/pages/admin-batch-details.css?raw')).default;
  const block = css.match(/\.admin-batch-trainer::before \{([\s\S]*?)\}/)?.[1] ?? '';
  expect(block).toMatch(/linear-gradient/);
  // Restrained: no blur filter, and it fades out by 60%.
  expect(block).not.toMatch(/backdrop-filter/);
  expect(block).toMatch(/60%/);
});

test('no literal colours are introduced in the card block', async () => {
  const css = (await import('../../styles/pages/admin-batch-details.css?raw')).default;
  const start = css.indexOf('.admin-batch-trainer {');
  const end = css.indexOf('ENROLLMENT SECTION HEADER');
  const block = css.slice(start, end);

  // Only the rgba used inside the deliberate gradient highlight is allowed.
  const withoutGradient = block.replace(/linear-gradient\([^;]*\);/g, '');
  expect(withoutGradient).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(withoutGradient).not.toMatch(/rgba?\(/);
});

// ── Responsive ─────────────────────────────────────────────────────────────
test('mobile rules stack the card and enlarge the tap target', async () => {
  await card();
  const mobile = allRules().filter(({ rule, mediaText }) =>
    mediaText?.includes('767px') && rule.selectorText?.startsWith('.admin-batch-trainer'));

  const stacked = mobile.find(({ rule }) => rule.selectorText === '.admin-batch-trainer');
  expect(stacked?.rule.style.getPropertyValue('flex-wrap')).toBe('wrap');

  const actions = mobile.find(({ rule }) => rule.selectorText === '.admin-batch-trainer__actions');
  expect(actions?.rule.style.getPropertyValue('width')).toBe('100%');

  const action = mobile.find(({ rule }) => rule.selectorText === '.admin-batch-trainer__action');
  expect(action?.rule.style.getPropertyValue('min-height')).toBe('44px');
});

// ── Surrounding page unaffected ────────────────────────────────────────────
test('the rest of the batch details page is untouched', async () => {
  const region = await card();

  // KPIs, enrollment section and its header all still render.
  expect(screen.getByRole('heading', { name: 'Student Enrollment', level: 2 })).toBeInTheDocument();
  // The header and the empty state both offer "Add Students" for this empty batch.
  expect(screen.getAllByRole('button', { name: /Add Students/ }).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('Enrolled Students')).toBeInTheDocument();
  // Batch name renders in both the page header and the breadcrumb.
  expect(screen.getAllByText('CSE 2024').length).toBeGreaterThanOrEqual(1);

  // The card does not swallow the page's other regions.
  expect(region).not.toContainElement(screen.getByRole('heading', { name: 'Student Enrollment', level: 2 }));
});