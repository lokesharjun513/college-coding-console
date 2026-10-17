// Tests for utils/compilerDiagnostics.js.
//
// Every string below is a real gcc-15 / g++-15 response captured from
// https://api.onlinecompiler.io/api/run-code-sync/, not invented shape.
//
// The parser's job is narrow and must stay narrow: surface the line and column
// the compiler ALREADY printed, and never manufacture one. These tests pin that
// as much as they pin the happy path.

import { describe, expect, test } from 'vitest';
import {
  parseCompilerDiagnostics,
  primaryDiagnostic,
  severityLabel,
  isPlaceholderProviderError,
  PROVIDER_PLACEHOLDER,
  NO_DIAGNOSTIC_MESSAGE,
} from './compilerDiagnostics';

/** gcc-15, type error: header carries line 3 and column 11. */
const C_TYPE_ERROR = '3:11: error: initialization of \'int\' from \'char *\' makes integer from pointer without a cast [-Wint-conversion]\n    3 |   int x = "oops";\n      |           ^~~~~~';

/** gcc-15, missing semicolon: multi-line excerpt spanning lines 3 and 4. */
const C_MISSING_SEMICOLON = '3:29: error: expected \';\' before \'return\'\n    3 |     printf("Hello from C\\n")\n      |                             ^\n      |                             ;\n    4 |   return 0;\n      |   ~~~~~~                      ';

/** gcc-15, fatal error with NO line number at all. */
const C_FATAL_NO_LOCATION = 'fatal error: nonexistent.h: No such file or directory\n    2 | #include <nonexistent.h>\n      |          ^~~~~~~~~~~~~~~\ncompilation terminated.';

/**
 * g++-15, exactly as captured. Note the two shapes gcc mixes freely:
 * the `error:` continuation carries NO location, while the trailing `note:`
 * does. The error is the actionable one.
 */
const CPP_WITH_FILE = "In function 'int main()':\n error: 'vector' is not a member of 'std'\n    1 | int main(){ std::vector<int> v; }\n      |                  ^~~~~~\ncode.cc:1:1: note: 'std::vector' is defined in header '<vector>'; this is probably fixable by adding '<vector>'";

describe('isPlaceholderProviderError', () => {
  test('recognises the provider sentinel, empty and non-string values', () => {
    expect(isPlaceholderProviderError(PROVIDER_PLACEHOLDER)).toBe(true);
    expect(isPlaceholderProviderError(`  ${PROVIDER_PLACEHOLDER}  `)).toBe(true);
    expect(isPlaceholderProviderError('')).toBe(true);
    expect(isPlaceholderProviderError('   ')).toBe(true);
    expect(isPlaceholderProviderError(undefined)).toBe(true);
    expect(isPlaceholderProviderError(null)).toBe(true);
    expect(isPlaceholderProviderError(42)).toBe(true);
  });

  test('a real compiler message is not a placeholder', () => {
    expect(isPlaceholderProviderError(C_MISSING_SEMICOLON)).toBe(false);
  });
});

describe('parseCompilerDiagnostics', () => {
  test('extracts line and column from a gcc type error', () => {
    const [d] = parseCompilerDiagnostics(C_TYPE_ERROR);
    expect(d.severity).toBe('error');
    expect(d.file).toBeNull();
    expect(d.line).toBe(3);
    expect(d.column).toBe(11);
    expect(d.message).toContain("initialization of 'int'");
    // The source excerpt and the caret indicator are preserved.
    expect(d.excerpt.join('\n')).toContain('int x = "oops";');
    expect(d.excerpt.join('\n')).toContain('^~~~~~');
  });

  test('keeps every source and caret row of a multi-line excerpt', () => {
    const [d] = parseCompilerDiagnostics(C_MISSING_SEMICOLON);
    expect(d.line).toBe(3);
    expect(d.column).toBe(29);
    expect(d.message).toBe("expected ';' before 'return'");
    const excerpt = d.excerpt.join('\n');
    expect(excerpt).toContain('printf("Hello from C\\n")');
    expect(excerpt).toContain('return 0;');
    expect(excerpt).toContain('^');
  });

  test('a fatal error with no location reports no line rather than guessing', () => {
    const [d] = parseCompilerDiagnostics(C_FATAL_NO_LOCATION);
    expect(d.severity).toBe('fatal error');
    expect(d.line).toBeNull();
    expect(d.column).toBeNull();
    expect(d.message).toContain('No such file or directory');
    expect(d.excerpt.join('\n')).toContain('#include <nonexistent.h>');
  });

  test('reads a filename out of the header and splits multiple diagnostics', () => {
    const all = parseCompilerDiagnostics(CPP_WITH_FILE);
    expect(all.length).toBe(2);

    const note = all.find((d) => d.severity === 'note');
    expect(note.file).toBe('code.cc');
    expect(note.line).toBe(1);
    expect(note.column).toBe(1);

    const error = all.find((d) => d.severity === 'error');
    expect(error.message).toBe("'vector' is not a member of 'std'");
    // gcc's `In function ...` continuation form carries no location of its own,
    // so none is reported rather than being read out of the excerpt's line number.
    expect(error.line).toBeNull();
    expect(error.column).toBeNull();
    expect(error.excerpt.join('\n')).toContain('int main(){ std::vector<int> v; }');
    expect(error.excerpt.join('\n')).toContain('^~~~~~');
  });

  test('never invents a location for text that is not a diagnostic', () => {
    for (const input of ['', '   ', PROVIDER_PLACEHOLDER, 'Segmentation fault', 'ValueError: boom', null, undefined, 17]) {
      expect(parseCompilerDiagnostics(input)).toEqual([]);
    }
  });

  test('a plain runtime message yields no located diagnostic', () => {
    // "line 3" in prose is not a compiler location and must not be treated as one.
    const all = parseCompilerDiagnostics('ValueError: problem on line 3 of the input');
    expect(all).toEqual([]);
  });
});

describe('primaryDiagnostic', () => {
  test('prefers a diagnostic that actually has a line', () => {
    const d = primaryDiagnostic(C_TYPE_ERROR);
    expect(d.severity).toBe('error');
    expect(d.line).toBe(3);
    expect(d.column).toBe(11);
  });

  test('headlines the error, not the located note that follows it', () => {
    // The note carries a line number but is only a hint; the error is what the
    // student must act on, so it wins the headline.
    const d = primaryDiagnostic(CPP_WITH_FILE);
    expect(d.severity).toBe('error');
    expect(d.message).toBe("'vector' is not a member of 'std'");
  });

  test('falls back to the first diagnostic when none is located', () => {
    const d = primaryDiagnostic(C_FATAL_NO_LOCATION);
    expect(d.severity).toBe('fatal error');
    expect(d.line).toBeNull();
  });

  test('ranks a fatal error above a plain error', () => {
    const d = primaryDiagnostic('fatal error: x.h: No such file or directory\n2:5: error: something else');
    expect(d.severity).toBe('fatal error');
  });

  test('is null when there is nothing to show', () => {
    expect(primaryDiagnostic(PROVIDER_PLACEHOLDER)).toBeNull();
    expect(primaryDiagnostic('')).toBeNull();
    expect(primaryDiagnostic(undefined)).toBeNull();
  });
});

describe('severityLabel', () => {
  test('maps the compiler severities it understands', () => {
    expect(severityLabel('fatal error')).toBe('Fatal error');
    expect(severityLabel('error')).toBe('Error');
    expect(severityLabel('warning')).toBe('Warning');
    expect(severityLabel('note')).toBe('Note');
  });

  test('falls back to the raw severity or a neutral default', () => {
    expect(severityLabel('something else')).toBe('something else');
    expect(severityLabel(undefined)).toBe('Error');
  });
});

describe('NO_DIAGNOSTIC_MESSAGE', () => {
  test('states that the service could not provide a location, and blames nothing', () => {
    expect(NO_DIAGNOSTIC_MESSAGE).toMatch(/could not provide a syntax-error location/i);
    expect(NO_DIAGNOSTIC_MESSAGE).not.toMatch(/line \d+/);
    expect(NO_DIAGNOSTIC_MESSAGE).not.toMatch(/infrastructure/i);
    expect(NO_DIAGNOSTIC_MESSAGE).not.toMatch(/compiler (id|configuration)/i);
  });
});
