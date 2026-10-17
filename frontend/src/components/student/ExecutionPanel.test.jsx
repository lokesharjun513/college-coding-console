// Tests for student/ExecutionPanel.jsx — the Output tab of the student
// ProblemDetail / Practice execution workflow.
//
// The bug these pin down: POST /api/student/problems/:id/run answers HTTP 200
// with `success: true` EVEN WHEN THE PROGRAM FAILED. The panel decided success
// from `result.type`, which is only 'error' when the HTTP request itself failed,
// so every in-band execution failure rendered as
// "✓ Custom Execution Successful" / "No output produced." / Exit Code -1.
//
// The provider envelopes below are the real shapes that endpoint returns, taken
// from live measurements against api.onlinecompiler.io:
//
//   python-3.14  print("hello"    -> 200 {status:"error", exit_code:-1,
//                                               error:"Internal error: code execution failed"}
//   openjdk-25   missing ';'      -> 200 {status:"error", exit_code:-1, ...same placeholder...}
//   gcc-15       missing ';'      -> 200 {status:"error", exit_code:1,
//                                               error:"2:28: error: expected ';' before 'return'"}
//   gcc-15       valid program    -> 200 {status:"success", exit_code:0, output:"..."}
//
// `result.data` is supplied directly rather than through the api layer: this is
// a pure rendering component, and driving it with the endpoint's real payloads is
// what makes the regression observable at all.

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import ExecutionPanel from './ExecutionPanel';

/** A problem with two visible examples, so the Tests tab has rows to show. */
const PROBLEM = {
  examples: [
    { input: '1 2', output: '3' },
    { input: '4 5', output: '9' },
  ],
};

const panel = (props) => (
  <ExecutionPanel
    problem={PROBLEM}
    activeTab="output"
    isRunning={false}
    {...props}
  />
);

const outputPane = () => screen.getByRole('tabpanel');

describe('Output tab — custom run (POST /api/student/problems/:id/run)', () => {
  test('a Python syntax error (-1, no diagnostics) is a failure, not a success', () => {
    // The reproduced defect: HTTP 200, success envelope, program never ran.
    render(panel({
      result: {
        type: 'customRun',
        data: {
          status: 'error',
          output: '',
          error: 'Internal error: code execution failed',
          exit_code: -1,
          signal: null,
          time: '0',
          total: '0',
          memory: '0',
        },
      },
    }));

    expect(within(outputPane()).queryByText(/Custom Execution Successful/)).toBeNull();
    expect(within(outputPane()).queryByText(/✓ Execution Successful/)).toBeNull();
    expect(within(outputPane()).getByText('✕ Execution Failed')).toBeInTheDocument();
    // The provider's placeholder is a sentinel, not a diagnostic, and must never
    // be shown to a student as if it were one.
    expect(outputPane().textContent).not.toMatch(/Internal error/i);
    // The honest explanation replaces it.
    expect(within(outputPane()).getByText(/could not run this program/i)).toBeInTheDocument();
    expect(outputPane().textContent).not.toMatch(/infrastructure/i);
    expect(outputPane().textContent).not.toMatch(/compiler id/i);
    // Exit code is reported exactly as received - not rewritten to 1.
    expect(within(outputPane()).getByText('Exit Code')).toBeInTheDocument();
    expect(within(outputPane()).getByText('-1')).toBeInTheDocument();
  });

  test('a Python syntax error never invents a traceback', () => {
    render(panel({
      result: {
        type: 'customRun',
        data: { status: 'error', output: '', error: 'Internal error: code execution failed', exit_code: -1, signal: null, time: '0', total: '0', memory: '0' },
      },
    }));

    const text = outputPane().textContent;
    expect(text).not.toMatch(/SyntaxError/);
    expect(text).not.toMatch(/Traceback/);
    expect(text).not.toMatch(/line \d+/);
  });

  test('a Java compilation error (-1, no diagnostics) is a failure, not a success', () => {
    render(panel({
      result: {
        type: 'customRun',
        data: { status: 'error', output: '', error: 'Internal error: code execution failed', exit_code: -1, signal: null, time: '0', total: '0', memory: '0' },
      },
    }));

    expect(within(outputPane()).getByText('✕ Execution Failed')).toBeInTheDocument();
    const text = outputPane().textContent;
    expect(text).not.toMatch(/Exception in thread/);
    expect(text).not.toMatch(/error:/);
    expect(text).not.toMatch(/Main\.java/);
  });

  test('a C compilation error shows the reported line and column, and its text verbatim', () => {
    const diagnostic = "3:29: error: expected ';' before 'return'\n    3 |     printf(\"Hello from C\\n\")\n      |                             ^\n      |                             ;\n    4 |   return 0;\n      |   ~~~~~~                      ";
    render(panel({
      result: {
        type: 'customRun',
        data: { status: 'error', output: '', error: diagnostic, exit_code: 1, signal: null, time: '0.0000', total: '0.0717', memory: '0' },
      },
    }));

    // No output and time "0" means the program never started: a compile failure.
    expect(within(outputPane()).getByText('✕ Compilation Error')).toBeInTheDocument();

    // The location the compiler reported, as structured fields.
    const summary = within(outputPane()).getByTestId('execution-diagnostic');
    expect(within(summary).getByText('Error')).toBeInTheDocument();
    expect(within(summary).getByText('Line 3')).toBeInTheDocument();
    expect(within(summary).getByText('Column 29')).toBeInTheDocument();
    expect(within(summary).getByText("expected ';' before 'return'")).toBeInTheDocument();

    // The compiler's own text is still shown in full, excerpt and carets intact.
    const verbatim = within(outputPane()).getByText(/3:29: error: expected/);
    expect(verbatim.textContent).toContain('return 0;');
    expect(verbatim.textContent).toContain('^');

    expect(within(outputPane()).getByText('Exit Code')).toBeInTheDocument();
    expect(within(outputPane()).getByText('1')).toBeInTheDocument();
    // The provider zeroes time/memory for a run that never happened; presenting
    // those zeros as measurements would be a lie.
    expect(within(outputPane()).queryByText('Execution')).toBeNull();
    expect(within(outputPane()).queryByText('Memory')).toBeNull();
  });

  test('no location is shown for a failure the provider gave no diagnostic for', () => {
    render(panel({
      result: {
        type: 'customRun',
        data: { status: 'error', output: '', error: 'Internal error: code execution failed', exit_code: -1, signal: null, time: '0', total: '0', memory: '0' },
      },
    }));

    // No structured diagnostic is invented from the placeholder.
    expect(within(outputPane()).queryByTestId('execution-diagnostic')).toBeNull();
    expect(outputPane().textContent).not.toMatch(/Line \d+/);
    expect(outputPane().textContent).not.toMatch(/Column \d+/);
  });

  test('a runtime failure that produced output keeps the output and shows a runtime heading', () => {
    const diagnostic = 'ValueError: boom\n';
    render(panel({
      result: {
        type: 'customRun',
        data: { status: 'error', output: 'before\n', error: diagnostic, exit_code: 1, signal: null, time: '0.0410', total: '0.0900', memory: '14100' },
      },
    }));

    // It produced output and consumed time, so the program did start.
    expect(within(outputPane()).getByText('✕ Runtime Error')).toBeInTheDocument();
    // Genuine diagnostics are never discarded.
    expect(within(outputPane()).getByText(/ValueError: boom/)).toBeInTheDocument();
    // Real measurements are shown for a run that really happened.
    expect(within(outputPane()).getByText('Execution')).toBeInTheDocument();
    expect(within(outputPane()).getByText('Memory')).toBeInTheDocument();
  });

  test('a valid program with output is a success and shows its output', () => {
    render(panel({
      result: {
        type: 'customRun',
        data: { status: 'success', output: 'Hello from Python\n', error: '', exit_code: 0, signal: null, time: '0.1278', total: '0.1908', memory: '14548' },
      },
    }));

    expect(within(outputPane()).getByText('✓ Custom Execution Successful')).toBeInTheDocument();
    expect(within(outputPane()).getByText(/Hello from Python/)).toBeInTheDocument();
    expect(within(outputPane()).getByText('Exit Code')).toBeInTheDocument();
    expect(within(outputPane()).getByText('0')).toBeInTheDocument();
  });

  test('a valid program with EMPTY output is still a success', () => {
    render(panel({
      result: {
        type: 'customRun',
        data: { status: 'success', output: '', error: '', exit_code: 0, signal: null, time: '0.0410', total: '0.0700', memory: '14000' },
      },
    }));

    expect(within(outputPane()).getByText('✓ Custom Execution Successful')).toBeInTheDocument();
    // Empty output is a real result, and is stated rather than shown as a failure.
    expect(within(outputPane()).getByText('The program produced no output.')).toBeInTheDocument();
    expect(within(outputPane()).queryByText(/Execution Failed/)).toBeNull();
  });

  test('a non-zero exit with no diagnostic is a failure with an unknown cause', () => {
    render(panel({
      result: {
        type: 'customRun',
        data: { status: 'error', output: '', error: '', exit_code: 3, signal: null, time: '0.0120', total: '0.05', memory: '14000' },
      },
    }));

    expect(within(outputPane()).getByText('✕ Execution Failed')).toBeInTheDocument();
    // Nothing invented, and exit code 3 preserved.
    expect(within(outputPane()).getByText('3')).toBeInTheDocument();
  });

  test('a signal reported by the provider is shown, not swallowed', () => {
    render(panel({
      result: {
        type: 'customRun',
        data: { status: 'error', output: '', error: 'Segmentation fault', exit_code: 139, signal: 11, time: '0.0100', total: '0.05', memory: '14000' },
      },
    }));

    expect(within(outputPane()).getByText('Signal')).toBeInTheDocument();
    expect(within(outputPane()).getByText('11')).toBeInTheDocument();
  });

  test('missing and malformed fields do not crash the component', () => {
    // No data at all. Nothing here is evidence that the run failed, so the panel
    // must not invent a failure - it must not crash either.
    const first = render(panel({ result: { type: 'customRun' } }));
    expect(within(outputPane()).getByText('✓ Custom Execution Successful')).toBeInTheDocument();
    first.unmount();

    // Wrong types throughout, including a non-numeric exit code.
    const second = render(panel({
      result: {
        type: 'customRun',
        data: { status: 42, output: null, error: { unexpected: 'object' }, exit_code: 'nope', signal: undefined, time: null },
      },
    }));
    expect(outputPane()).toBeInTheDocument();
    expect(within(outputPane()).getByText('✓ Custom Execution Successful')).toBeInTheDocument();
    second.unmount();

    // An error result whose body has no message still fails cleanly.
    render(panel({ result: { type: 'error', data: {} } }));
    expect(within(outputPane()).getByText('✕ Execution Failed')).toBeInTheDocument();
  });

  test('a malformed exit code does not mask a real failure signal', () => {
    // status "error" is evidence on its own, even if exit_code is unusable.
    render(panel({
      result: { type: 'customRun', data: { status: 'error', output: '', error: '', exit_code: 'nope' } },
    }));

    expect(within(outputPane()).getByText('✕ Execution Failed')).toBeInTheDocument();
  });
});

describe('Output tab — test-run and submission results', () => {
  test('a finished test run reports success', () => {
    render(panel({
      result: {
        type: 'run',
        data: { status: 'FINISHED', total: 2, passed: 2, results: [{ index: 0, passed: true, output: '3', error: '' }] },
      },
    }));

    expect(within(outputPane()).getByText('✓ Execution Successful')).toBeInTheDocument();
  });

  test('a test run stopped by a fatal verdict reports that verdict, not success', () => {
    render(panel({
      result: {
        type: 'run',
        data: { status: 'COMPILATION_ERROR', total: 2, passed: 0, results: [{ index: 0, passed: false, output: '', error: "3:11: error: initialization of 'int' from 'char *'" }] },
      },
    }));

    expect(within(outputPane()).queryByText('✓ Execution Successful')).toBeNull();
    expect(within(outputPane()).getByText('✕ COMPILATION_ERROR')).toBeInTheDocument();
    // The failing row's error is surfaced rather than dropped. Matched on the
    // header, since the message also appears in the structured summary.
    expect(within(outputPane()).getByText(/3:11: error: initialization/)).toBeInTheDocument();
  });

  test('a submission verdict drives the heading and its failing diagnostic is shown', () => {
    render(panel({
      result: {
        type: 'submit',
        data: { id: 'x', verdict: 'RUNTIME_ERROR', testResults: [{ testCase: '1', passed: false, output: '', error: 'Segmentation fault' }] },
      },
    }));

    expect(within(outputPane()).getByText('✕ RUNTIME_ERROR')).toBeInTheDocument();
    expect(within(outputPane()).getByText('Segmentation fault')).toBeInTheDocument();
  });

  test('an accepted submission reports success', () => {
    render(panel({
      result: { type: 'submit', data: { id: 'x', verdict: 'ACCEPTED', testResults: [{ testCase: '1', passed: true, output: '3', error: '' }] } },
    }));

    expect(within(outputPane()).getByText('✓ Execution Successful')).toBeInTheDocument();
  });
});

describe('Result tab strip — accessibility', () => {
  test('exposes a tablist of tabs with the tabpanel they control', () => {
    render(<ExecutionPanel problem={PROBLEM} isRunning={false} />);

    expect(screen.getByRole('tablist', { name: 'Execution results' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Test Cases', 'Output', 'Submission Result']);
    for (const tab of tabs) expect(tab).toHaveAttribute('aria-controls', 'execution-tabpanel');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'execution-tabpanel');
  });

  test('Arrow/Home/End keys move the selected tab (roving tabindex)', async () => {
    // Uncontrolled, so selection is owned by the component itself.
    render(<ExecutionPanel problem={PROBLEM} isRunning={false} />);

    const testsTab = screen.getByRole('tab', { name: 'Test Cases' });
    // Only the active tab is in the tab order.
    expect(testsTab).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Output' })).toHaveAttribute('tabindex', '-1');

    testsTab.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Output' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Submission Result' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Test Cases' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Submission Result' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Test Cases tab is unaffected', () => {
  test('test rows still reflect run results', () => {
    render(
      <ExecutionPanel
        problem={PROBLEM}
        activeTab="tests"
        isRunning={false}
        result={{ type: 'run', data: { status: 'FINISHED', total: 2, passed: 1, results: [{ index: 0, passed: true, output: '3', error: '' }, { index: 1, passed: false, output: '8', error: '' }] } }}
      />,
    );

    expect(within(outputPane()).getByText('Test Case 1')).toBeInTheDocument();
    expect(within(outputPane()).getByText('Test Case 2')).toBeInTheDocument();
    expect(within(outputPane()).getByText('1 / 2')).toBeInTheDocument();
  });
});
