// Tests for student/ProblemDetail.jsx — the Run/Submit request contract.
//
// The regression these pin down: the payload `language` must be the problem's
// own language key (e.g. 'python') from `allowedLanguages`. The backend resolves
// the compiler itself via `problem.compilers.get(language)`, and rejects any
// value not in `allowedLanguages` — so sending a compiler id such as
// 'python-3.14' made every Run fail with 400 "Language not supported for this
// problem". They also pin that a failed request is surfaced (the panel switches
// to the Output tab) instead of leaving the Tests tab looking like nothing ran.

import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Monaco does not run in jsdom; a plain textarea drives the same value/onChange
// contract the page uses.
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange, language }) => (
    <textarea
      aria-label="code-editor"
      data-language={language}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
  loader: { init: () => Promise.resolve({ editor: { defineTheme: () => {} } }) },
}));

vi.mock('../../api/student', () => ({
  getStudentProblem: vi.fn(),
  runStudentTests: vi.fn(),
  runStudentProblem: vi.fn(),
  createSubmission: vi.fn(),
}));

import ProblemDetail from './ProblemDetail';
import { getStudentProblem, runStudentTests, runStudentProblem, createSubmission } from '../../api/student';

const PROBLEM = {
  id: 'p1',
  title: 'Sum Two Numbers',
  description: 'Add two integers.',
  difficulty: 'EASY',
  topic: 'Arrays',
  allowedLanguages: ['python', 'cpp'],
  starterCode: { python: 'print(1)\n', cpp: 'int main() {}' },
  scope: 'GLOBAL',
  examples: [{ input: '1 2', output: '3' }],
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/student/problems/p1']}>
      <Routes>
        <Route path="/student/problems/:id" element={<ProblemDetail />} />
      </Routes>
    </MemoryRouter>,
  );

const runButton = () => screen.getByRole('button', { name: 'Run' });
const submitButton = () => screen.getByRole('button', { name: 'Submit' });
const outputPane = () => screen.getByRole('tabpanel');

beforeEach(() => {
  vi.clearAllMocks();
  getStudentProblem.mockResolvedValue({ data: { data: PROBLEM } });
});

test('Run sends the problem language key, never a compiler id', async () => {
  runStudentTests.mockResolvedValue({
    data: { data: { status: 'FINISHED', total: 1, passed: 1, results: [{ index: 0, passed: true, output: '3', error: '' }] } },
  });

  renderPage();
  await screen.findByText('Sum Two Numbers');

  await userEvent.click(runButton());

  await waitFor(() => expect(runStudentTests).toHaveBeenCalledTimes(1));
  expect(runStudentTests).toHaveBeenCalledWith('p1', { language: 'python', code: 'print(1)\n' });
  // A compiler id ('python-3.14') fails the backend's allowedLanguages guard.
  expect(runStudentTests.mock.calls[0][1].language).not.toMatch(/-/);
});

test('changing the language sends the newly selected key', async () => {
  runStudentTests.mockResolvedValue({
    data: { data: { status: 'FINISHED', total: 1, passed: 1, results: [] } },
  });

  renderPage();
  await screen.findByText('Sum Two Numbers');

  await userEvent.selectOptions(screen.getByRole('combobox'), 'cpp');
  await userEvent.click(runButton());

  await waitFor(() => expect(runStudentTests).toHaveBeenCalledTimes(1));
  expect(runStudentTests).toHaveBeenCalledWith('p1', { language: 'cpp', code: 'print(1)\n' });
});

test('Run against test cases shows the result on the Tests tab', async () => {
  runStudentTests.mockResolvedValue({
    data: { data: { status: 'FINISHED', total: 1, passed: 1, results: [{ index: 0, passed: true, output: '3', error: '' }] } },
  });

  renderPage();
  await screen.findByText('Sum Two Numbers');
  await userEvent.click(runButton());

  expect(await within(outputPane()).findByText('1 / 1')).toBeInTheDocument();
});

test('a custom-input run sends the stdin and shows its output', async () => {
  runStudentProblem.mockResolvedValue({
    data: { data: { status: 'success', output: '5\n', error: '', exit_code: 0, time: '0.01', memory: '9000' } },
  });

  renderPage();
  await screen.findByText('Sum Two Numbers');

  await userEvent.click(screen.getByRole('checkbox', { name: /run custom input/i }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Custom Input' }), '2 3');
  await userEvent.click(runButton());

  await waitFor(() => expect(runStudentProblem).toHaveBeenCalledTimes(1));
  expect(runStudentProblem).toHaveBeenCalledWith('p1', { language: 'python', code: 'print(1)\n', input: '2 3' });
  expect(runStudentTests).not.toHaveBeenCalled();
  expect(await screen.findByText(/Custom Execution Successful/)).toBeInTheDocument();
  expect(within(outputPane()).getByText(/5/)).toBeInTheDocument();
});

test('a rejected run surfaces the server message instead of silently doing nothing', async () => {
  runStudentTests.mockRejectedValue({
    response: { data: { success: false, message: 'Language not supported for this problem' } },
  });

  renderPage();
  await screen.findByText('Sum Two Numbers');
  await userEvent.click(runButton());

  // The panel must leave the Tests tab, which cannot render a request error.
  expect(await screen.findByText('Language not supported for this problem')).toBeInTheDocument();
  expect(within(outputPane()).getByText('✕ Execution Failed')).toBeInTheDocument();
});

test('empty source is still submitted and its rejection is surfaced', async () => {
  runStudentTests.mockRejectedValue({
    response: { data: { success: false, message: 'Language and code are required' } },
  });

  renderPage();
  await screen.findByText('Sum Two Numbers');

  await userEvent.clear(screen.getByRole('textbox', { name: 'code-editor' }));
  await userEvent.click(runButton());

  await waitFor(() => expect(runStudentTests).toHaveBeenCalledWith('p1', { language: 'python', code: '' }));
  expect(await screen.findByText('Language and code are required')).toBeInTheDocument();
});

test('Submit posts the raw language key and shows the verdict', async () => {
  createSubmission.mockResolvedValue({
    data: { data: { id: 's1', verdict: 'ACCEPTED', testResults: [{ testCase: '1', passed: true, output: '3', error: '' }] } },
  });

  renderPage();
  await screen.findByText('Sum Two Numbers');
  await userEvent.click(submitButton());

  await waitFor(() => expect(createSubmission).toHaveBeenCalledTimes(1));
  expect(createSubmission).toHaveBeenCalledWith({ problemId: 'p1', language: 'python', code: 'print(1)\n' });
  expect(await screen.findByText('✓ Accepted')).toBeInTheDocument();
});

test('Run and Submit are both disabled while a run is in flight', async () => {
  // Never resolves, so the run stays in progress for the assertion.
  runStudentTests.mockReturnValue(new Promise(() => {}));

  renderPage();
  await screen.findByText('Sum Two Numbers');
  await userEvent.click(runButton());

  await waitFor(() => expect(runButton()).toBeDisabled());
  expect(submitButton()).toBeDisabled();
});

test('the selected language defaults to the first allowed language', async () => {
  renderPage();
  await screen.findByText('Sum Two Numbers');

  const select = screen.getByRole('combobox');
  expect(select).toHaveValue('python');
  expect(within(select).getAllByRole('option').map((option) => option.value)).toEqual(['python', 'cpp']);
});

test('the custom-input editor only exists once the checkbox is enabled', async () => {
  renderPage();
  await screen.findByText('Sum Two Numbers');

  expect(screen.queryByRole('textbox', { name: 'Custom Input' })).toBeNull();

  await userEvent.click(screen.getByRole('checkbox', { name: /run custom input/i }));

  expect(screen.getByRole('textbox', { name: 'Custom Input' })).toBeInTheDocument();
});

test('the statement and results toggles collapse and expand their panes', async () => {
  renderPage();
  await screen.findByText('Sum Two Numbers');

  // The statement pane is open, so its handle offers to collapse it.
  const collapse = screen.getByRole('button', { name: 'Collapse problem description' });
  expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await userEvent.click(collapse);

  expect(screen.queryByText('Sum Two Numbers')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Expand problem description' }));
  expect(await screen.findByText('Sum Two Numbers')).toBeInTheDocument();

  // The results pane starts closed and is unmounted until opened.
  expect(screen.queryByRole('tabpanel')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Expand results panel' }));
  expect(screen.getByRole('tabpanel')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Collapse results panel' }));
  expect(screen.queryByRole('tabpanel')).toBeNull();
});

test('a failed run opens the results panel on the Output tab', async () => {
  runStudentTests.mockRejectedValue({ response: { data: { message: 'boom' } } });

  renderPage();
  await screen.findByText('Sum Two Numbers');

  expect(screen.queryByRole('tabpanel')).toBeNull();
  await userEvent.click(runButton());

  expect(await screen.findByRole('tabpanel')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Output' })).toHaveAttribute('aria-selected', 'true');
});
