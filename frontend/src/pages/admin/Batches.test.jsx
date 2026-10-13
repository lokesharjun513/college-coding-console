// Focused checks for the Admin Batches table:
//   - no batch description is rendered in the table
//   - the batch name is a real, keyboard-accessible button
//   - clicking it navigates to the existing Batch Details route
//   - other columns and table alignment are unchanged
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Batches from './Batches';
import { getBatches, getTrainers } from '../../api/admin';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../api/admin', () => ({
  getBatches: vi.fn(),
  createBatch: vi.fn(),
  updateBatch: vi.fn(),
  deleteBatch: vi.fn(),
  getTrainers: vi.fn(),
}));

const batch = (overrides = {}) => ({
  id: 'batch-1',
  name: 'Full Stack 2026',
  code: 'FS-2026-A',
  description: 'Backend and frontend foundations for the 2026 cohort.',
  status: 'ACTIVE',
  startDate: '2026-06-01',
  endDate: '2030-05-31',
  trainer: { id: 'trainer-1', name: 'Test Trainer', email: 'testtrainer@gmail.com' },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  getBatches.mockResolvedValue({ data: { success: true, data: [batch()] } });
  getTrainers.mockResolvedValue({ data: { success: true, data: [] } });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/batches']}>
      <Routes>
        <Route path="/admin/batches" element={<Batches />} />
        <Route path="/admin/batches/:batchId" element={<div>Batch Details Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const table = () => screen.getByRole('table');

// ── 1. Description removed from the table ──────────────────────────────────
test('no batch description is rendered anywhere in the table', async () => {
  renderPage();
  await screen.findByRole('button', { name: /View details for Full Stack 2026/ });

  expect(within(table()).queryByText('Backend and frontend foundations for the 2026 cohort.')).not.toBeInTheDocument();
  // Nor a Description column header.
  expect(within(table()).queryByRole('columnheader', { name: /description/i })).not.toBeInTheDocument();
  // The batch name itself is untouched.
  expect(within(table()).getByText('Full Stack 2026')).toBeInTheDocument();
});

test('a batch without a description renders identically', async () => {
  getBatches.mockResolvedValue({ data: { success: true, data: [batch({ description: '' })] } });
  renderPage();
  await screen.findByRole('button', { name: /View details for Full Stack 2026/ });
  expect(within(table()).getByText('Full Stack 2026')).toBeInTheDocument();
});

// ── 2. Batch name is a real button ─────────────────────────────────────────
test('the batch name renders as a real button with an accessible label', async () => {
  renderPage();
  const btn = await screen.findByRole('button', { name: 'View details for Full Stack 2026' });

  expect(btn.tagName).toBe('BUTTON');
  expect(btn).toHaveAttribute('type', 'button');
  expect(btn).toHaveClass('admin-batch-name-btn');
  expect(btn).toHaveTextContent('Full Stack 2026');
  expect(btn).toHaveAttribute('title', 'View Batch Details');
});

// ── 3. Navigation ──────────────────────────────────────────────────────────
test('clicking the batch name navigates to the batch details page', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /View details for Full Stack 2026/ }));
  expect(mockNavigate).toHaveBeenCalledWith('/admin/batches/batch-1');
});

test('each row navigates to its own batch', async () => {
  getBatches.mockResolvedValue({
    data: {
      success: true,
      data: [
        batch(),
        batch({ id: 'batch-2', name: 'Data Science 2027', code: 'DS-2027', description: 'other' }),
      ],
    },
  });
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: /View details for Data Science 2027/ }));
  expect(mockNavigate).toHaveBeenCalledWith('/admin/batches/batch-2');
});

// ── 4. Other columns / layout unchanged ────────────────────────────────────
test('the remaining columns and their values are unchanged', async () => {
  renderPage();
  await screen.findByRole('button', { name: /View details for Full Stack 2026/ });

  const headers = within(table()).getAllByRole('columnheader').map((th) => th.textContent.trim());
  expect(headers).toEqual(['#', 'Batch Name', 'Code', 'Trainer', 'Timeline', 'Status', 'Actions']);

  expect(within(table()).getByText('FS-2026-A')).toBeInTheDocument();
  expect(within(table()).getByText('Test Trainer')).toBeInTheDocument();
  expect(within(table()).getByText('ACTIVE')).toBeInTheDocument();
  // Row actions are preserved.
  expect(within(table()).getAllByRole('button', { name: /Edit/i }).length).toBeGreaterThan(0);
  expect(within(table()).getAllByRole('button', { name: /Delete/i }).length).toBeGreaterThan(0);
});

test('the unassigned trainer affordance still works', async () => {
  getBatches.mockResolvedValue({ data: { success: true, data: [batch({ trainer: null })] } });
  renderPage();

  const assignBtn = await screen.findByRole('button', { name: 'Assign trainer to Full Stack 2026' });
  expect(assignBtn).toBeInTheDocument();
  expect(within(table()).getByText('Unassigned')).toBeInTheDocument();
});

// ── 5. Styling uses existing tokens ────────────────────────────────────────
test('the button reuses existing admin design tokens', async () => {
  const css = (await import('../../styles/pages/admin-batches.css?raw')).default;
  const rule = css.match(/\.admin-batch-name-btn \{([\s\S]*?)\}/)?.[1] ?? '';

  // Shared tokens, not hard-coded hex values.
  expect(rule).toMatch(/background:\s*var\(--admin-surface/);
  expect(rule).toMatch(/border:\s*1px solid var\(--admin-border-light/);
  expect(rule).toMatch(/border-radius:\s*var\(--admin-radius-lg/);
  expect(rule).toMatch(/box-shadow:\s*var\(--admin-shadow-sm/);
  expect(rule).toMatch(/color:\s*var\(--admin-text-primary/);
  expect(rule).toMatch(/transition:.*var\(--admin-transition-base/);
  expect(rule).toMatch(/font-family:\s*inherit/);

  // No new colours introduced in the rule body itself.
  const body = rule.replace(/\/\*.*?\*\//gs, '');
  expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(body).not.toMatch(/rgba?\(/);
});