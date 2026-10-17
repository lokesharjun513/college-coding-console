// Tests for student/FreeConsole.jsx — the Student sandbox (/student/freeconsole).
//
// Monaco is replaced with a textarea stub: `@monaco-editor/react` loads the real
// editor from a CDN, which jsdom cannot do, and the editor's own behaviour is not
// what these tests are about. Everything else runs for real, including
// `api/student`.
//
// Pinned here:
//   - the language selector is built from GET /student/console/languages, not a
//     hardcoded list, and falls back visibly when that request fails;
//   - POST /student/console/run receives exactly { code, language, input };
//   - the run endpoint's own response shape is classified correctly (it is
//     deliberately NOT the platform `{ success, data }` envelope);
//   - success, compile error, runtime error, timeout, rejection and transport
//     failure each render their own state;
//   - the languages the provider gives no diagnostic for (Python, Java) show an
//     honest execution failure and never an invented traceback or compiler
//     message, while a diagnostic the provider does supply is shown verbatim;
//   - an ambiguous failure is never presented as a confirmed infrastructure or
//     compiler-configuration fault;
//   - a successful run that produced no output stays a success;
//   - throttling, from either the provider or this app's own limiter, is labelled
//     as throttling and never blamed on the student's code;
//   - runtime and memory are shown only when the response actually carries them;
//   - a rejected request never leaves the previous report on screen;
//   - changing language is confirmed before the buffer is replaced;
//   - reset and clear work, and the page settles under <React.StrictMode>.

import React, { StrictMode } from 'react';
import { vi, beforeEach, afterEach, test, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { runFreeConsoleCode, getStudentConsoleLanguages } = vi.hoisted(() => ({
  runFreeConsoleCode: vi.fn(),
  getStudentConsoleLanguages: vi.fn(),
}));

vi.mock('../../api/student', () => ({ runFreeConsoleCode, getStudentConsoleLanguages }));

// Monaco never loads in jsdom; the stub keeps the `value` / `onChange` contract
// the page relies on so code editing is still genuinely exercised.
vi.mock('@monaco-editor/react', () => {
  const Editor = ({ value, onChange, language }) => (
    <textarea
      data-testid="code-editor"
      aria-label={`Code editor (${language})`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
  return {
    __esModule: true,
    default: Editor,
    loader: { init: () => Promise.resolve({ editor: { defineTheme: vi.fn() } }) },
  };
});

import FreeConsole from './FreeConsole';

const LANGUAGES = [
  { value: 'python', label: 'Python', file: 'main.py' },
  { value: 'c', label: 'C', file: 'main.c' },
  { value: 'cpp', label: 'C++', file: 'main.cpp' },
  { value: 'java', label: 'Java', file: 'Main.java' },
  { value: 'typescript', label: 'TypeScript', file: 'main.ts' },
];

/** A successful run, exactly as POST /student/console/run answers 200. */
const successReport = (overrides = {}) => ({
  data: {
    success: true,
    status: 'success',
    language: 'python',
    compiler: 'onlinecompiler',
    exitCode: 0,
    output: 'Hello, student!\n',
    error: null,
    stdout: 'Hello, student!\n',
    stderr: '',
    compile_output: '',
    ...overrides,
  },
});

const renderPage = () =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/student/freeconsole']}>
        <FreeConsole />
      </MemoryRouter>
    </StrictMode>,
  );

const outputPane = () => screen.getByRole('region', { name: /execution output/i });
const editorPane = () => screen.getByRole('region', { name: /code editor/i });
const editor = () => screen.getByTestId('code-editor');
const runButton = () => screen.getByRole('button', { name: /run code/i });

beforeEach(() => {
  vi.clearAllMocks();
  getStudentConsoleLanguages.mockResolvedValue({ data: { success: true, data: LANGUAGES } });
  runFreeConsoleCode.mockResolvedValue(successReport());
});

/* ── languages ─────────────────────────────────────────────────────── */

test('the language list comes from the console endpoint', async () => {
  renderPage();
  await waitFor(() => expect(getStudentConsoleLanguages).toHaveBeenCalled());

  const select = await screen.findByLabelText('Language');
  expect(Array.from(select.options).map((o) => o.value)).toEqual(['python', 'c', 'cpp', 'java', 'typescript']);
  expect(screen.getByText('main.py')).toBeInTheDocument();
});

test('a failed language request falls back visibly rather than silently', async () => {
  getStudentConsoleLanguages.mockRejectedValue(new Error('offline'));
  renderPage();

  await waitFor(() => expect(screen.getByText(/language list could not be loaded/i)).toBeInTheDocument());
  // The console is still usable.
  expect(screen.getByLabelText('Language')).toBeInTheDocument();
  expect(runButton()).toBeInTheDocument();
});

test('a server list without the current language moves the selection onto a real one', async () => {
  getStudentConsoleLanguages.mockResolvedValue({
    data: { success: true, data: [{ value: 'go', label: 'Go', file: 'main.go' }] },
  });
  renderPage();

  await waitFor(() => expect(screen.getByLabelText('Language')).toHaveValue('go'));
});

test('changing language is confirmed before the buffer is replaced', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.selectOptions(screen.getByLabelText('Language'), 'c');

  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent(/change programming language/i);
  expect(editor().value).toContain('print');

  // Cancelling leaves everything untouched.
  await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Language')).toHaveValue('python');
  expect(editor().value).toContain('print');

  await userEvent.selectOptions(screen.getByLabelText('Language'), 'c');
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /change language/i }));

  await waitFor(() => expect(editor().value).toContain('#include <stdio.h>'));
  expect(screen.getByText('main.c')).toBeInTheDocument();
});

test('a run in flight when the language is switched never paints its result', async () => {
  // Confirming the dialog replaces the buffer and the language, so a run started
  // against the previous language describes code that is no longer on screen.
  // Before the fix its response landed as a stale report: a C run's output shown
  // under the newly selected Python tab.
  let release;
  runFreeConsoleCode.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());
  await waitFor(() => expect(screen.getByRole('button', { name: /running/i })).toBeDisabled());

  await userEvent.selectOptions(screen.getByLabelText('Language'), 'c');
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /change language/i }));
  await waitFor(() => expect(screen.getByLabelText('Language')).toHaveValue('c'));

  // The superseded run now answers with a report for the old language.
  release(successReport({ output: 'FROM_PYTHON\n', language: 'python' }));

  await waitFor(() => expect(screen.getByText('main.c')).toBeInTheDocument());
  expect(screen.queryByText(/FROM_PYTHON/)).not.toBeInTheDocument();
  expect(within(outputPane()).queryByText(/run your code to see its output here/i)).toBeInTheDocument();
  // The superseded request released the running state, so the console stays usable.
  await waitFor(() => expect(screen.getByRole('button', { name: /run code/i })).toBeEnabled());
});

/* ── running ───────────────────────────────────────────────────────── */

test('the run request carries exactly the code, language and stdin', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.type(screen.getByLabelText('Standard input'), '42\n');
  await userEvent.click(runButton());

  await waitFor(() => expect(runFreeConsoleCode).toHaveBeenCalledTimes(1));
  expect(runFreeConsoleCode).toHaveBeenCalledWith({
    code: expect.stringContaining('print'),
    language: 'python',
    input: '42\n',
  });
});

test('code edits are sent, not the starter template', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.clear(editor());
  await userEvent.type(editor(), 'print(1+1)');
  await userEvent.click(runButton());

  await waitFor(() => expect(runFreeConsoleCode).toHaveBeenCalled());
  expect(runFreeConsoleCode.mock.calls[0][0].code).toBe('print(1+1)');
});

test('a successful run shows its output and exit code', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText(/Hello, student!/)).toBeInTheDocument();
    return p;
  });

  expect(within(pane).getByText('Success')).toBeInTheDocument();
  expect(within(pane).getByText(/Exit code: 0/)).toBeInTheDocument();
});

test('runtime and memory are shown only when the report carries them', async () => {
  runFreeConsoleCode.mockResolvedValue(successReport({ time: '0.13', memory: '2048' }));
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());
  await waitFor(() => expect(within(outputPane()).getByText(/Runtime: 0.13s/)).toBeInTheDocument());
  expect(within(outputPane()).getByText(/Memory: 2048 KB/)).toBeInTheDocument();
});

test('a report without measurements invents nothing', async () => {
  // The executor reported neither; the UI must not fill in a plausible figure.
  runFreeConsoleCode.mockResolvedValue(successReport({ time: undefined, memory: undefined }));
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());
  await waitFor(() => expect(within(outputPane()).getByText(/Hello, student!/)).toBeInTheDocument());

  expect(within(outputPane()).queryByText(/Runtime:/)).not.toBeInTheDocument();
  expect(within(outputPane()).queryByText(/Memory:/)).not.toBeInTheDocument();
});

/* ── failure states ────────────────────────────────────────────────── */

test('a compilation error is labelled and its text is shown', async () => {
  runFreeConsoleCode.mockResolvedValue(successReport({
    success: false,
    status: 'compile_error',
    exitCode: 1,
    output: '',
    error: "main.py:1 SyntaxError: invalid syntax",
    stdout: '',
    compile_output: "main.py:1 SyntaxError: invalid syntax",
  }));
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText(/Compilation error/)).toBeInTheDocument();
    return p;
  });
  expect(within(pane).getByText(/SyntaxError/)).toBeInTheDocument();
});

test('a timeout is labelled as such', async () => {
  runFreeConsoleCode.mockResolvedValue({
    data: { success: false, status: 'timeout', output: '', error: 'Code execution service timed out.' },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText(/Timed out/)).toBeInTheDocument();
    return p;
  });
  expect(within(pane).getByText('Code execution service timed out.')).toBeInTheDocument();
});

test('a provider 429 is labelled as rate limiting, never as a code failure', async () => {
  // The provider answered 429 (the console route reports `status: 'rate_limited'`).
  // Before this was a recognised status the page fell through to the generic
  // branch and badged the run "Runtime error", which blames the student's code
  // for the service refusing to run it.
  runFreeConsoleCode.mockRejectedValue({
    response: {
      status: 429,
      data: { success: false, status: 'rate_limited', exitCode: null, output: '', error: 'The code execution service is rate limiting requests. Please wait a moment and try again.' },
    },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Rate limited')).toBeInTheDocument();
    return p;
  });
  expect(within(pane).queryByText('Runtime error')).not.toBeInTheDocument();
  expect(within(pane).queryByText('Compilation error')).not.toBeInTheDocument();
  expect(within(pane).getByText(/rate limiting requests/i)).toBeInTheDocument();
});

test("this app's own execution limiter is shown as throttling, not a dead connection", async () => {
  // The in-app code-execution limiter answers with a bare
  // `{ message, code: 'RATE_LIMIT_EXCEEDED' }` and no `status`, which used to fall
  // through to the transport-failure panel badged "Service unavailable".
  runFreeConsoleCode.mockRejectedValue({
    response: { status: 429, data: { success: false, message: 'Too many code executions. Please wait before running again.', code: 'RATE_LIMIT_EXCEEDED' } },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Rate limited')).toBeInTheDocument();
    return p;
  });
  expect(within(pane).getByText(/Too many code executions/i)).toBeInTheDocument();
  // Not the "Could not run your code" recovery panel: retrying immediately is
  // exactly what the student should not do.
  expect(within(pane).queryByText(/Could not run your code/i)).not.toBeInTheDocument();
});

/**
 * Python and Java are the two console languages for which the provider never
 * returns a diagnostic. Measured live against the provider, `print("hello"` and
 * a Java `main` missing its semicolon both answer HTTP 200 with
 * `exit_code: -1` and the placeholder "Internal error: code execution failed" —
 * while gcc-15 / g++-15 return `exit_code: 1` with real compiler text.
 *
 * So the honest thing to show for Python and Java is an execution failure, and
 * the dishonest thing would be to invent a traceback or a javac message. These
 * tests pin that nothing fabricated can reach the screen.
 */
const pythonSyntaxFailure = () => ({
  response: {
    status: 502,
    data: {
      success: false,
      status: 'execution_failed',
      language: 'python',
      compiler: 'python-3.14',
      exitCode: -1,
      signal: null,
      output: '',
      error: 'The code execution service could not run this program and returned no diagnostics. The program may have been stopped in a way the service cannot report. Please try again.',
    },
  },
});

test('a Python syntax error shows an honest failure and no invented SyntaxError', async () => {
  runFreeConsoleCode.mockRejectedValue(pythonSyntaxFailure());
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Execution failed')).toBeInTheDocument();
    return p;
  });

  expect(within(pane).getByText(/could not run this program/i)).toBeInTheDocument();
  // `-1` is shown as the provider reported it, not as 1.
  expect(within(pane).getByText('Exit code: -1')).toBeInTheDocument();
  // No placeholder leaked, and no diagnosis was invented.
  const shown = within(pane).getByText(/could not run this program/i).textContent;
  expect(shown).not.toMatch(/Internal error/i);
  expect(shown).not.toMatch(/SyntaxError/);
  expect(shown).not.toMatch(/Traceback/);
  expect(shown).not.toMatch(/line \d+/);
});

test('a Java compile error shows an honest failure and no invented javac message', async () => {
  runFreeConsoleCode.mockRejectedValue({
    response: {
      status: 502,
      data: {
        success: false,
        status: 'execution_failed',
        language: 'java',
        compiler: 'openjdk-25',
        exitCode: -1,
        signal: null,
        output: '',
        error: 'The code execution service could not run this program and returned no diagnostics. The program may have been stopped in a way the service cannot report. Please try again.',
      },
    },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Execution failed')).toBeInTheDocument();
    return p;
  });

  const shown = within(pane).getByText(/could not run this program/i).textContent;
  expect(shown).not.toMatch(/Exception in thread/);
  expect(shown).not.toMatch(/error:/);
  expect(shown).not.toMatch(/Main\.java/);
  // No fake metrics for a program that never ran.
  expect(within(pane).queryByText(/^Runtime:/)).not.toBeInTheDocument();
  expect(within(pane).queryByText(/^Memory:/)).not.toBeInTheDocument();
});

test('a real compiler diagnostic is shown verbatim when the provider supplies one', async () => {
  // The gcc case: the diagnostic must survive intact. This is the counterpart to
  // the two cases above - a pipeline that dropped real text would look identical
  // to a provider that never sent any.
  const diagnostic = "2:28: error: expected ';' before 'return'\n    2 | int main(void){ printf(\"x\")\n      |                            ^\n";
  runFreeConsoleCode.mockResolvedValue({
    data: {
      success: false,
      status: 'compile_error',
      language: 'c',
      compiler: 'gcc-15',
      exitCode: 1,
      signal: null,
      output: '',
      error: diagnostic,
      stdout: '',
      stderr: diagnostic,
      compile_output: diagnostic,
    },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Compilation error')).toBeInTheDocument();
    return p;
  });
  // Matched on the header, which only the verbatim <pre> contains; the message
  // also appears in the structured summary above it.
  expect(within(pane).getByText(/2:28: error: expected/)).toBeInTheDocument();
  expect(within(pane).getByText('Exit code: 1')).toBeInTheDocument();

  // The reported location is surfaced as fields, not left buried in the text.
  const summary = within(pane).getByTestId('fc-diagnostic');
  expect(within(summary).getByText('Line 2')).toBeInTheDocument();
  expect(within(summary).getByText('Column 28')).toBeInTheDocument();
});

test('an ambiguous failure never tells the student the compiler setup is broken', async () => {
  // The misclassification this guards against: treating exit_code === -1 as a
  // confirmed infrastructure fault and advising the student to "check the
  // compiler ID and API configuration". The provider sends nothing that supports
  // that, and it is the wrong thing to tell a student who simply mistyped a
  // bracket.
  runFreeConsoleCode.mockRejectedValue(pythonSyntaxFailure());
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Execution failed')).toBeInTheDocument();
    return p;
  });

  const shown = within(pane).getByText(/could not run this program/i).textContent;
  expect(shown).not.toMatch(/infrastructure/i);
  expect(shown).not.toMatch(/compiler id/i);
  expect(shown).not.toMatch(/api configuration/i);
  expect(shown).not.toMatch(/configuration/i);
  // And nothing anywhere on the page suggests it either.
  expect(pane.textContent).not.toMatch(/infrastructure/i);
  expect(pane.textContent).not.toMatch(/api configuration/i);
});

test('a successful program with no output reports success, not a failure', async () => {
  // exit_code 0 and an empty output is a real, successful result. It must not be
  // turned into an error state, and the empty output must not be filled with
  // invented text.
  runFreeConsoleCode.mockResolvedValue({
    data: {
      success: true,
      status: 'success',
      language: 'python',
      compiler: 'python-3.14',
      exitCode: 0,
      signal: null,
      output: '',
      error: null,
      stdout: '',
      stderr: '',
      compile_output: '',
      time: '0.041',
      total: '0.07',
      memory: '14000',
    },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Success')).toBeInTheDocument();
    return p;
  });
  expect(within(pane).getByText('The program produced no output.')).toBeInTheDocument();
  expect(within(pane).getByText('Exit code: 0')).toBeInTheDocument();
  expect(within(pane).queryByText(/Execution failed/i)).not.toBeInTheDocument();
});

/**
 * C and C++ are the languages whose real line numbers are available: gcc-15 and
 * g++-15 return `exit_code: 1` with the compiler's own message, header and
 * source excerpt. The console must surface the location AND keep the text
 * verbatim, while never inventing a location for the languages that supply none.
 */
const GCC_MISSING_SEMICOLON = '3:29: error: expected \';\' before \'return\'\n    3 |     printf("Hello from C\\n")\n      |                             ^\n      |                             ;\n    4 |   return 0;\n      |   ~~~~~~                       ';

test('a C compile error shows the reported line and column, and its text verbatim', async () => {
  runFreeConsoleCode.mockResolvedValue({
    data: {
      success: false,
      status: 'compile_error',
      language: 'c',
      compiler: 'gcc-15',
      exitCode: 1,
      signal: null,
      output: '',
      error: GCC_MISSING_SEMICOLON,
      stdout: '',
      stderr: GCC_MISSING_SEMICOLON,
      compile_output: GCC_MISSING_SEMICOLON,
    },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Compilation error')).toBeInTheDocument();
    return p;
  });

  // The location the compiler actually reported, as structured fields.
  const summary = within(pane).getByTestId('fc-diagnostic');
  expect(within(summary).getByText('Error')).toBeInTheDocument();
  expect(within(summary).getByText('Line 3')).toBeInTheDocument();
  expect(within(summary).getByText('Column 29')).toBeInTheDocument();
  expect(within(summary).getByText("expected ';' before 'return'")).toBeInTheDocument();

  // And the compiler's own text, unaltered, including its excerpt and carets.
  // Matched on the header, which only the verbatim <pre> contains.
  const verbatim = within(pane).getByText(/3:29: error: expected/);
  expect(verbatim.textContent).toContain('printf("Hello from C\\n")');
  expect(verbatim.textContent).toContain('^');
});

test('a C++ diagnostic with a filename shows the file alongside the location', async () => {
  const diagnostic = "In function 'int main()':\n error: 'vector' is not a member of 'std'\n    1 | int main(){ std::vector<int> v; }\n      |                  ^~~~~~\ncode.cc:1:1: note: 'std::vector' is defined in header '<vector>'";
  runFreeConsoleCode.mockResolvedValue({
    data: {
      success: false,
      status: 'compile_error',
      language: 'cpp',
      compiler: 'g++-15',
      exitCode: 1,
      signal: null,
      output: '',
      error: diagnostic,
      stdout: '',
      stderr: diagnostic,
      compile_output: diagnostic,
    },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Compilation error')).toBeInTheDocument();
    return p;
  });
  const summary = within(pane).getByTestId('fc-diagnostic');
  expect(within(summary).getByText("'vector' is not a member of 'std'")).toBeInTheDocument();
  // The `error:` continuation gcc emits carries no location of its own, so none
  // is shown - the located `note:` below it is still visible in the raw text.
  expect(within(summary).queryByText(/^Line /)).toBeNull();
  expect(within(summary).queryByText(/^Column /)).toBeNull();
  expect(pane.textContent).toContain('code.cc');
});

test('no line number is invented when the provider supplies no diagnostic', async () => {
  runFreeConsoleCode.mockRejectedValue(pythonSyntaxFailure());
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Execution failed')).toBeInTheDocument();
    return p;
  });

  // No structured diagnostic is rendered at all for a placeholder failure.
  expect(within(pane).queryByTestId('fc-diagnostic')).toBeNull();
  expect(pane.textContent).not.toMatch(/Line \d+/);
  expect(pane.textContent).not.toMatch(/Column \d+/);
});

/**
 * A genuine Python traceback. The provider does NOT return one today for a
 * plain failure (it returns `exit_code: -1` and its placeholder sentinel), but
 * it DOES return one when the text actually reaches it, so the console must
 * render it verbatim rather than swallowing it.
 */
const pythonTraceback = [
  'Traceback (most recent call last):',
  '  File "<student>", line 1',
  "    print ('Hello World'",
  '          ^',
  "SyntaxError: '(' was never closed",
].join('\n');

test('a genuine Python traceback is shown verbatim, not discarded', async () => {
  runFreeConsoleCode.mockRejectedValue({
    response: {
      status: 502,
      data: {
        success: false,
        status: 'execution_failed',
        language: 'python',
        compiler: 'python-3.14',
        exitCode: -1,
        signal: null,
        output: '',
        error: pythonTraceback,
      },
    },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Execution failed')).toBeInTheDocument();
    return p;
  });

  // The traceback text reaches the student intact.
  const shown = within(pane).getByText(/Traceback \(most recent call last\)/);
  expect(shown.textContent).toContain('line 1');
  expect(shown.textContent).toContain("SyntaxError: '(' was never closed");
  // `-1` is still reported as the provider sent it, not as 1.
  expect(within(pane).getByText('Exit code: -1')).toBeInTheDocument();
  // A Python traceback is not a gcc header, so no line/column fields are
  // invented from it.
  expect(within(pane).queryByTestId('fc-diagnostic')).toBeNull();
});

test('a Java compile diagnostic is shown verbatim when the provider sends one', async () => {
  const javac = 'Main.java:4: error: \';\' expected\n        System.out.println("hello")\n                             ^\n';
  runFreeConsoleCode.mockRejectedValue({
    response: {
      status: 502,
      data: {
        success: false,
        status: 'execution_failed',
        language: 'java',
        compiler: 'openjdk-25',
        exitCode: -1,
        signal: null,
        output: '',
        error: javac,
      },
    },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Execution failed')).toBeInTheDocument();
    return p;
  });
  expect(within(pane).getByText(/Main.java:4: error: ';' expected/)).toBeInTheDocument();
  // No placeholder metrics for a run that never happened.
  expect(within(pane).queryByText(/^Runtime:/)).not.toBeInTheDocument();
  expect(within(pane).queryByText(/^Memory:/)).not.toBeInTheDocument();
});

test('a successful run that wrote to stderr stays a success and keeps the text', async () => {
  // Live: python-3.14 returns `status: "success", exit_code: 0` with the stderr
  // text in `error`. It must not be shown as a failure.
  runFreeConsoleCode.mockResolvedValue({
    data: {
      success: true,
      status: 'success',
      language: 'python',
      compiler: 'python-3.14',
      exitCode: 0,
      signal: null,
      output: 'value = 42\n',
      error: '/sandbox/code.py:2: UserWarning: deprecated API\n',
      stdout: 'value = 42\n',
      stderr: '/sandbox/code.py:2: UserWarning: deprecated API\n',
      compile_output: '',
      time: '0.085',
      total: '0.14',
      memory: '14900',
    },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Success')).toBeInTheDocument();
    return p;
  });
  expect(within(pane).getByText(/value = 42/)).toBeInTheDocument();
  // The warning is kept, not swallowed.
  expect(within(pane).getByText(/UserWarning: deprecated API/)).toBeInTheDocument();
  expect(within(pane).getByText('Exit code: 0')).toBeInTheDocument();
  expect(within(pane).queryByText('Execution failed')).not.toBeInTheDocument();
});

test('a rejected request with a report renders that report, not a generic failure', async () => {
  runFreeConsoleCode.mockRejectedValue({
    response: { status: 400, data: { success: false, status: 'invalid_request', error: 'Unsupported language: go' } },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Rejected')).toBeInTheDocument();
    return p;
  });
  expect(within(pane).getByText(/Unsupported language/)).toBeInTheDocument();
  expect(within(pane).queryByText(/could not reach/i)).not.toBeInTheDocument();
});

test('a provider execution failure is never shown as a compilation error', async () => {
  // The provider answered 502 execution_failed because it could not run the
  // program at all. That is not a diagnostic about the student's code.
  runFreeConsoleCode.mockRejectedValue({
    response: {
      status: 502,
      data: {
        success: false,
        status: 'execution_failed',
        error: 'The code execution service could not run this program and returned no diagnostics.',
      },
    },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Execution failed')).toBeInTheDocument();
    return p;
  });
  expect(within(pane).queryByText('Compilation error')).not.toBeInTheDocument();
  expect(within(pane).getByText(/could not run this program/i)).toBeInTheDocument();
});

test('a runtime failure is labelled a runtime error, not a compilation error', async () => {
  runFreeConsoleCode.mockResolvedValue({
    data: {
      success: false,
      status: 'runtime_error',
      exitCode: 1,
      output: 'before\n',
      error: 'ValueError: boom',
      stdout: 'before\n',
      stderr: 'ValueError: boom',
      compile_output: '',
    },
  });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByText('Runtime error')).toBeInTheDocument();
    return p;
  });
  expect(within(pane).getByText('ValueError: boom')).toBeInTheDocument();
  expect(within(pane).queryByText('Compilation error')).not.toBeInTheDocument();
});

test('a transport failure is recoverable through Try again', async () => {
  runFreeConsoleCode.mockRejectedValue(new Error('Network Error'));
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());

  const pane = await waitFor(() => {
    const p = outputPane();
    expect(within(p).getByRole('alert')).toBeInTheDocument();
    return p;
  });
  expect(within(pane).getByText(/Could not run your code/)).toBeInTheDocument();
  expect(within(pane).getByText('Network Error')).toBeInTheDocument();

  runFreeConsoleCode.mockResolvedValue(successReport());
  await userEvent.click(within(pane).getByRole('button', { name: /try again/i }));

  await waitFor(() => expect(within(outputPane()).getByText(/Hello, student!/)).toBeInTheDocument());
  expect(within(outputPane()).queryByRole('alert')).not.toBeInTheDocument();
});

test('a failed run clears the previous report instead of leaving stale output', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(runButton());
  await waitFor(() => expect(within(outputPane()).getByText(/Hello, student!/)).toBeInTheDocument());

  runFreeConsoleCode.mockRejectedValue(new Error('Network Error'));
  await userEvent.click(runButton());

  await waitFor(() => expect(within(outputPane()).getByRole('alert')).toBeInTheDocument());
  expect(within(outputPane()).queryByText(/Hello, student!/)).not.toBeInTheDocument();
});

test('the initial state invites the student to run something', async () => {
  renderPage();
  await waitFor(() => expect(outputPane()).toBeInTheDocument());
  expect(within(outputPane()).getByText(/run your code to see its output here/i)).toBeInTheDocument();
});

/* ── reset / clear / states ────────────────────────────────────────── */

test('reset restores the starter program and clears the input and report', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.clear(editor());
  await userEvent.type(editor(), 'changed');
  await userEvent.type(screen.getByLabelText('Standard input'), '7');
  await userEvent.click(runButton());
  await waitFor(() => expect(within(outputPane()).getByText(/Hello, student!/)).toBeInTheDocument());

  await userEvent.click(screen.getByRole('button', { name: /^reset$/i }));

  expect(editor().value).toContain('print');
  expect(screen.getByLabelText('Standard input')).toHaveValue('');
  expect(within(outputPane()).queryByText(/Hello, student!/)).not.toBeInTheDocument();
});

test('clear empties the output but keeps the code', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.clear(editor());
  await userEvent.type(editor(), 'print(2)');
  await userEvent.click(runButton());
  await waitFor(() => expect(within(outputPane()).getByText(/Hello, student!/)).toBeInTheDocument());

  await userEvent.click(within(outputPane()).getByRole('button', { name: /clear/i }));

  expect(within(outputPane()).queryByText(/Hello, student!/)).not.toBeInTheDocument();
  expect(editor()).toHaveValue('print(2)');
});

test('the run control is disabled while a run is in flight', async () => {
  let release;
  runFreeConsoleCode.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  renderPage();
  await waitFor(() => expect(screen.getByLabelText('Language')).toBeInTheDocument());

  await userEvent.click(screen.getByRole('button', { name: /run code/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /running/i })).toBeDisabled());
  expect(within(outputPane()).getByText(/executing/i)).toBeInTheDocument();

  release(successReport());
  await waitFor(() => expect(screen.getByRole('button', { name: /run code/i })).toBeEnabled());
});

test('the page settles under StrictMode with the real data', async () => {
  renderPage();
  await waitFor(() => expect(editor().value).toContain('print'), { timeout: 3000 });
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Free Console');
  expect(screen.getByLabelText('Language')).toBeInTheDocument();
});

test('the breadcrumb uses router links, not full page reloads', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument());

  const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
  expect(within(crumbs).getByText('Student')).toHaveAttribute('href', '/student');
  expect(within(crumbs).getByText('Free Console')).toHaveAttribute('aria-current', 'page');
  // The old markup used <a href>, which would reload the whole app.
  expect(crumbs.querySelector('a[href="/"]')).toBeNull();
});

test('no visible title block competes with the breadcrumb', async () => {
  renderPage();
  await waitFor(() => expect(editorPane()).toBeInTheDocument());

  // The breadcrumb names the page, so the heading exists only to give the
  // document an outline. Nothing is rendered visibly next to it.
  const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
  expect(crumbs.nextElementSibling).toBe(screen.getByRole('heading', { level: 1 }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('fc-visually-hidden');
});

test('the workspace offers exactly one Run control', async () => {
  renderPage();
  await waitFor(() => expect(editorPane()).toBeInTheDocument());

  expect(screen.getAllByRole('button', { name: /^run code$/i })).toHaveLength(1);
  // No duplicate Run/Execute control hiding in a pane header or the footer.
  expect(screen.getAllByRole('button', { name: /run code|running|execute/i })).toHaveLength(1);
});

test('the editor and stdin are both reachable and labelled', async () => {
  renderPage();
  await waitFor(() => expect(editorPane()).toBeInTheDocument());

  expect(editor()).toHaveAttribute('aria-label', 'Code editor (python)');
  expect(screen.getByLabelText('Standard input')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: /program input/i })).toBeInTheDocument();
});
// ---------------------------------------------------------------------------
// TEMPORARY EXPERIMENT � OneCompiler embed gating.
//
// The panel is opt-in. These pin that the flag is the only thing that decides
// whether it appears, and that turning it off restores the page exactly: the
// existing console, its toolbar and its execution path are untouched.
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.unstubAllEnvs();
});

test('the OneCompiler panel is absent while the experiment flag is unset', async () => {
  vi.stubEnv('VITE_USE_ONECOMPILER_TEST_EMBED', undefined);

  renderPage();
  await waitFor(() => expect(editorPane()).toBeInTheDocument());

  expect(document.getElementById('oc-editor')).toBeNull();
  expect(screen.queryByRole('region', { name: /onecompiler/i })).toBeNull();
  // The real console is still the whole page.
  expect(editorPane()).toBeInTheDocument();
  expect(outputPane()).toBeInTheDocument();
});

test('the OneCompiler panel appears when the flag is exactly "true"', async () => {
  vi.stubEnv('VITE_USE_ONECOMPILER_TEST_EMBED', 'true');

  renderPage();
  await waitFor(() => expect(editorPane()).toBeInTheDocument());

// The panel's title bar, explanatory paragraph, footer and attribution were
  // removed to give the editor their height; the region role remains.
  const panel = screen.getByRole('region', { name: /onecompiler/i });
  expect(within(panel).queryByRole('link', { name: /onecompiler/i })).toBeNull();
  expect(within(panel).queryByText(/temporary test/i)).toBeNull();

  const embed = document.getElementById('oc-editor');
  expect(embed).not.toBeNull();
  expect(embed.getAttribute('src')).toBe(
    'https://onecompiler.com/embed/?theme=dark&listenToEvents=true&codeChangeEvent=true&hideEditorOptions=true&hideTitle=true&hideNew=true&hideNewFileOption=true&fontSize=14',
  );

  // The existing console is untouched and still runs through our own endpoint.
  expect(editorPane()).toBeInTheDocument();
  expect(runButton()).toBeInTheDocument();
});

test('a loose flag value does not turn the experiment on', async () => {
  for (const loose of ['1', 'yes', 'TRUE', 'on']) {
    vi.stubEnv('VITE_USE_ONECOMPILER_TEST_EMBED', loose);
    const view = renderPage();
    await waitFor(() => expect(editorPane()).toBeInTheDocument());
    expect(document.getElementById('oc-editor')).toBeNull();
    view.unmount();
  }
});

test('enabling the panel does not disturb our own execution path', async () => {
  vi.stubEnv('VITE_USE_ONECOMPILER_TEST_EMBED', 'true');
  runFreeConsoleCode.mockResolvedValue(successReport());

  renderPage();
  await waitFor(() => expect(editorPane()).toBeInTheDocument());

  await userEvent.click(runButton());

  // Still exactly one Run control for the platform's own console: the embedded
  // editor's Run button lives inside a cross-origin frame and cannot be reached
  // or duplicated here.
  expect(screen.getAllByRole('button', { name: /run code/i })).toHaveLength(1);

  await waitFor(() =>
    expect(runFreeConsoleCode).toHaveBeenCalledWith({
      code: 'print("Hello, student!")\n',
      language: 'python',
      input: '',
    }),
  );
});
