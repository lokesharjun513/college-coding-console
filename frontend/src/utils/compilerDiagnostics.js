// frontend/src/utils/compilerDiagnostics.js
//
// Parses the diagnostics that C and C++ compilers actually return.
//
// WHY THIS EXISTS
//
// gcc-15 and g++-15 return the real compiler message, including the source line
// and column, e.g.
//
//   3:11: error: initialization of 'int' from 'char *' makes integer from
//   pointer without a cast [-Wint-conversion]
//       3 |   int x = "oops";
//         |           ^~~~~~
//
// That text is currently shown, but only as a wall of monospace. The line and
// column the compiler already computed are the part a student actually needs, so
// they are extracted here and shown as fields next to the untouched original.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//
// - It never infers a line number. Only a line number the compiler printed in the
//   diagnostic header is reported. A caret position is NOT converted into a
//   column, because the caret is aligned to the start of the highlighted token
//   while gcc's column counts from a slightly different origin, so deriving one
//   can be off by a character. An absent column stays absent.
// - It never invents a diagnostic. If the compiler printed nothing usable, the
//   result is null and the caller shows an honest "no diagnostic" message.
// - It never rewrites the compiler's text. `raw` is always the original string,
//     and callers keep rendering it in full.

/**
 * The provider's own "I would not run this" marker.
 *
 * Measured live: python-3.14 and openjdk-25 answer EVERY failed run - syntax
 * error or runtime error - with `exit_code: -1` and this exact text. It is a
 * sentinel, not a diagnostic, and must never be presented to a student as the
 * reason their program failed.
 */
export const PROVIDER_PLACEHOLDER = 'Internal error: code execution failed';

/**
 * Shown when a run failed and the provider gave nothing usable to explain why.
 * Deliberately blames nothing and points at nothing the provider did not say.
 */
export const NO_DIAGNOSTIC_MESSAGE =
  'The execution service could not provide a syntax-error location. '
  + 'Check your code and try again.';

/** True for the provider's placeholder sentinel (or an empty/absent value). */
export function isPlaceholderProviderError(text) {
  if (typeof text !== 'string') return true;
  const trimmed = text.trim();
  return trimmed === '' || trimmed === PROVIDER_PLACEHOLDER;
}

const SEVERITIES = 'fatal error|error|warning|note';

/** `    3 |   int x = "oops";` - a quoted source line. */
const SOURCE_LINE = /^\s*\d+\s*\|\s?(.*)$/;
/** `      |           ^~~~~~` - the caret / underline row. */
const CARET_LINE = /^\s*\|\s?(.*)$/;

/**
 * Two passes, tried in order, because gcc emits three header shapes and they are
 * ambiguous under a single regex:
 *
 *   1. `line[:col]: severity: message`      - gcc omits the filename when the
 *                                             source has none ("3:29: error: ...")
 *   2. `file:line[:col]: severity: message` - with a filename ("code.cc:1:1: note: ...")
 *   3. `severity: message`                  - no location at all
 *      ("fatal error: nonexistent.h: No such file or directory")
 *
 * Trying 1 before 2 is what keeps "3:29" from being read as file "3" with line
 * 29. A single combined regex resolves that ambiguity by backtracking towards
 * the shortest file group, which silently shifts the line number.
 */
const HEADER_NO_FILE = new RegExp('^(\\d+)(?::(\\d+))?:\\s*(' + SEVERITIES + '):\\s*(.*)$');
const HEADER_WITH_FILE = new RegExp('^(.+?):(\\d+)(?::(\\d+))?:\\s*(' + SEVERITIES + '):\\s*(.*)$');
// gcc indents continuation severities, e.g. " error: 'vector' is not a member of 'std'".
const HEADER_NO_LOCATION = new RegExp('^\\s*(' + SEVERITIES + '):\\s*(.*)$');

function matchHeader(line) {
  const noFile = line.match(HEADER_NO_FILE);
  if (noFile) {
    return {
      severity: noFile[3],
      file: null,
      line: Number.parseInt(noFile[1], 10),
      column: noFile[2] ? Number.parseInt(noFile[2], 10) : null,
      message: noFile[4],
    };
  }
  const withFile = line.match(HEADER_WITH_FILE);
  if (withFile) {
    return {
      severity: withFile[4],
      file: withFile[1].trim() !== '' ? withFile[1] : null,
      line: Number.parseInt(withFile[2], 10),
      column: withFile[3] ? Number.parseInt(withFile[3], 10) : null,
      message: withFile[5],
    };
  }
  const noLocation = line.match(HEADER_NO_LOCATION);
  if (noLocation) {
    return {
      severity: noLocation[1],
      file: null,
      line: null,
      column: null,
      message: noLocation[2],
    };
  }
  return null;
}

/**
 * Parse every diagnostic in a compiler message.
 *
 * @param {string} text - the provider's `error` field, verbatim
 * @returns {Array<{severity:string,file:string|null,line:number|null,
 *                  column:number|null,message:string,excerpt:string[]}>}
 */
export function parseCompilerDiagnostics(text) {
  if (typeof text !== 'string' || text.trim() === '') return [];

  const lines = text.split('\n');
  const found = [];
  let current = null;

  const closeCurrent = () => {
    if (current) {
      found.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    const header = matchHeader(line);
    if (header) {
      closeCurrent();
      current = { ...header, excerpt: [] };
      continue;
    }

    if (!current) continue;

    const source = line.match(SOURCE_LINE);
    if (source) {
      current.excerpt.push(source[1]);
      continue;
    }
    const caret = line.match(CARET_LINE);
    if (caret) {
      // Continuation of the excerpt. gcc emits rows with no `^` here too, as
      // fix-it hints ("      |          ;"), and they belong to the diagnostic.
      current.excerpt.push(caret[1]);
      continue;
    }
    // Anything else ends the current diagnostic's excerpt.
    closeCurrent();
  }

  closeCurrent();
  return found;
}

/**
 * Severity ranking, most serious first.
 *
 * gcc/g++ emit supplementary `note:` rows that often DO carry a location
 * ("code.cc:1:1: note: 'std::vector' is defined in header '<vector>'"), so
 * ranking by "has a line number" alone would surface the hint and hide the
 * actual error. The error is what the student needs to act on.
 */
const SEVERITY_RANK = { 'fatal error': 0, error: 1, warning: 2, note: 3 };

/**
 * The diagnostic to headline: the most serious one, preferring a located
 * diagnostic among equals. Null when there is nothing to show.
 */
export function primaryDiagnostic(text) {
  const all = parseCompilerDiagnostics(text);
  if (all.length === 0) return null;
  return all.slice().sort((a, b) => {
    const rank = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (rank !== 0) return rank;
    // Within one severity, a located diagnostic is the useful one.
    return (a.line === null ? 1 : 0) - (b.line === null ? 1 : 0);
  })[0];
}

/** Human label for a severity, for the "category" field. */
export function severityLabel(severity) {
  switch (severity) {
    case 'fatal error': return 'Fatal error';
    case 'error': return 'Error';
    case 'warning': return 'Warning';
    case 'note': return 'Note';
    default: return severity || 'Error';
  }
}
