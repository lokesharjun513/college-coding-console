# Optional Python Syntax Diagnostics — Technical Proposal

**Status:** investigation only. **No production code was changed.**
**Date:** 2026-10-16

---

## 1. Why this document exists

The provider supplies real diagnostics for C and C++ (`gcc-15`, `g++-15` return
`exit_code: 1` with line/column and a source excerpt). It supplies **none** for
Python or Java: `python-3.14` and `openjdk-25` return `exit_code: -1` and
`error: "Internal error: code execution failed"` for every failure, syntax or
runtime alike. The Free Console and the Practice panel therefore show an honest
"execution failed, cause unknown" and never invent a line number.

This investigation asks whether a **non-executing** Python syntax checker can
close that gap, and what it would cost and be worth.

---

## 2. Method

Two facts were established first, by measurement rather than assumption:

1. **Python *can* produce diagnostics through the supported synchronous API.**
   `sys.stderr.write(...)` comes back in the `error` field, and
   `traceback.print_exc()` comes back in `output` with a real
   `File "<student>", line N` frame.
2. **…but only when the process exits 0.** Any non-zero exit collapses to
   `-1` + placeholder, discarding stderr *and* stdout. A syntax error never
   produces output at all, because the program never starts.

So the diagnostic is lost to the provider's `-1` substitution, not to Python's
inability to diagnose. That is the gap a local checker would fill.

**Evaluation corpus:** 51 Python programs — 38 valid, 13 invalid — covering
decorators, type hints, f-strings, walrus, `match`, comprehensions, raw strings,
backslash continuations, unicode identifiers, triple-quoted docstrings,
brackets inside strings and comments, plus 9 programs that are syntactically
valid but fail at **runtime** and 2 that read **stdin**.

**Oracle:** CPython 3.14.7 `ast.parse`, which parses and never executes. The
same major version the provider's `python-3.14` runs.

> Harness note: an early run reported CPython rejecting `café = 1`. That was the
> harness, not either tool — piping via stdin let CPython decode with cp1252 and
> turn `é` into `©`. Ground truth was moved to UTF-8 files. This is recorded
> because it is itself a finding for option B2 (see §5).

---

## 3. Option A — browser-based parser (`@lezer/python`)

Parse-only, no execution, no network. Runs entirely in the page.

### Measured results (v1.1.19)

| Property | Measurement |
|---|---|
| **False positives** | **0 / 38 valid programs** |
| **Detection** | **10 / 13 invalid (77%)** |
| **Missed** | 3 — unexpected indent, unterminated string, misplaced return |
| **Exact line vs CPython** | **8 / 10 detected**; 2 wrong |
| **Independence from provider** | Yes — pure function of a string; zero network calls |

The 0 false positives include all 9 runtime-error programs and both stdin
programs, which is the property that matters most: a checker that called a
working program broken would be worse than useless.

### Where it fails

- **Unclosed bracket/paren** (`print("hello"`, `d = [1, 2`) is detected, but the
  reported position is the *recovery point* — the line **after** the unclosed
  construct, not CPython's line.
- **Unterminated string** (`s = "abc`) is **missed entirely**. Error recovery
  silently closes the string. This is one of the most common beginner errors.
- **Indentation errors** are largely missed; the CST models no
  `Indent`/`Dedent` nodes.
- Strict mode (`parser.configure({strict: true})`) changes **nothing**
  (identical flag/no-flag on 51/51) and merely *throws* `SyntaxError: No parse
  at N` instead of returning nodes. Use default mode.

### Cost

| | |
|---|---|
| Shipped JS | `@lezer/python` 43.0 KB raw / **16.9 KB gzip** |
| | `@lezer/common` 81.4 / 19.9 KB gzip |
| | `@lezer/lr` 71.4 / 17.5 KB gzip |
| | **Minimum total (no highlight)** | **195.8 KB raw / 54.3 KB gzip** |
| Current app bundle | 1,571.7 KB raw / 388.1 KB gzip → **≈ +14%** |
| `@lezer/highlight` | not required for diagnostics; omit it |
| Dependency surface | **4 packages, all `@lezer/*`, zero third-party transitives** |
| Browser compatibility | Pure ESM. No Node builtins. One guarded `typeof process != "undefined" && process.env…` debug flag (safe, short-circuits). Verified parsing unchanged inside **jsdom**. |
| `eval` / `new Function` | **none** in shipped code |
| Maintenance | Active CodeMirror 6 / Lezer project; version 1.1.19 |

---

## 4. Option B1 — server-side syntax-only parser (Node)

The same grammar on the backend. **Identical accuracy** (77% detection, same
wrong-line and missed-string gaps), so it buys no correctness — only a different
deployment point. It would add a backend dependency and a round trip on the run
path, and would have to be deliberately excluded from judging.

**Verdict: strictly worse than A.** No accuracy gain, more moving parts.

---

## 5. Option B2 — server-side `ast.parse` subprocess

The only option that is **exact**: real CPython, so real messages, real lines,
real columns, and it catches the unterminated string A misses.

Requirements: Python on the host (3.14.7 found locally), and
`child_process`. Measured cost ~30–60 ms per call.

Costs and hazards:

- The backend currently contains **zero** `child_process` / `exec` / `spawn`
  usage. This introduces process spawning into a codebase that deliberately has
  none, with the usual surface (argument injection, resource exhaustion).
- The UTF-8 hazard above is a live risk, not theoretical.
- Every call forks a process; needs timeout and memory limits.
- It depends on the deploy host having Python, which is not established for the
  Atlas-hosted environment.

**Verdict: highest fidelity, highest operational cost.** Not a bug-fix-sized
change; needs an operations decision.

---

## 6. Option C — retain current provider behaviour

Zero new dependencies, zero new code, zero risk of misdiagnosis. The UI already
says the execution service could not provide a location. C and C++ already show
real line numbers.

**Verdict: correct default.**

---

## 7. Requirement coverage

| Requirement | A (browser) | B1 (Node) | B2 (subprocess) | C (current) |
|---|---|---|---|---|
| Never executes student code | Yes | Yes | Yes (`ast.parse` only) | Yes |
| No `eval` / shell | Yes | Yes | Process spawn | Yes |
| Never claims a confirmed syntax error | Only with explicit labelling | same | same | Yes |
| No guessed line number | **Cannot** — 2/10 wrong | same | Exact | Yes (shows none) |
| Valid code never flagged | **Yes, 0/38** | Yes | Yes | Yes |
| Runtime errors not misread | **Yes, 9/9** | Yes | Yes | Yes |
| Independent of OnlineCompiler.io | **Yes** | Yes | Yes | n/a |
| Dependency cost | +54.3 KB gzip | +54.3 KB gzip | 0 KB, new runtime dep | 0 |
| New attack surface | None | None | Process execution | None |

---

## 8. Invariants verified

Against the candidate checker, on the 51-case corpus:

- **Valid code** — 38/38 accepted, including brackets in strings and comments,
  f-string braces, colons inside string values, raw strings, unicode identifiers.
- **stdin handling** — `input()` and `sys.stdin.read()` programs accepted.
- **Runtime errors** — 9/9 accepted (`NameError`, `ZeroDivisionError`,
  `TypeError`, `KeyError`, `assert`, recursion, `sys.exit`, `raise`).
- **Judge verdicts** — untouched by construction. `mapResultToVerdict` reads only
  the provider response, and no checker runs before or after judging. A syntax
  checker must never be able to change a verdict.

---

## 9. Recommendation

**Adopt Option C now. Add Option A as an opt-in advisory hint, not as a
diagnostic — and only after accepting the caveats below.**

Reasoning:

1. **The safety property holds.** Zero false positives across 38 valid programs,
   including every runtime-error and stdin case. It will not tell a student
   their working code is broken.
2. **It is not a diagnostic.** It finds 77% of syntax errors, misses unterminated
   strings entirely, and reports the wrong line for unclosed brackets. It must be
   worded as *"possible syntax problem near line X"* and must never be labelled a
   `SyntaxError` or shown with the compiler's authority.
3. **The most common beginner errors are the weakest cases.** A missing closing
   paren is found but reported one line late; an unterminated string is not found
   at all. That materially limits the student benefit.
4. **Option B1 is strictly dominated** — same accuracy, more moving parts.
5. **Option B2 is the only route to exactness** and should be evaluated
   separately, but it means introducing process execution into a backend that has
   none. That is an operations decision, not a code fix.

**Explicitly not recommended:** shipping Option A as the only Python diagnostic,
or letting any checker influence a submission verdict.

**Java remains out of scope.** No Java grammar was evaluated; no independently
valid solution was identified.

---

## 10. Limitations of this proposal

- Accuracy figures come from **51 programs**, not a language-wide corpus. A
  larger fuzzed corpus would likely move the numbers, especially the missed
  unterminated-string class.
- `@lezer/python` parses Python but is **not CPython**. It is a grammar with
  error recovery, and must never be presented as equivalent to the interpreter.
- The Java path was not investigated.
- Option B2 assumes a Python interpreter on the deploy host, which is not
  established.

---

## 11. Proof of concept (isolated, outside the repository)

Location: `%LOCALAPPDATA%\Temp\opencode\pypy-diag\`

| File | Purpose |
|---|---|
| `poc3.mjs` | Full comparison against CPython 3.14 `ast.parse` |
| `poc.test.mjs` | **8 tests**, expectations baked in from the CPython run so they run anywhere |
| `compat.mjs` | Browser-compatibility and supply-chain probe |
| `size.mjs` | Bundle-size measurement |

```
node --test poc.test.mjs      ->  8 passed, 0 failed
```

No file in `backend/src`, `frontend/src`, or any `package.json` was modified.
`@lezer/python` is **not** installed in the repository.