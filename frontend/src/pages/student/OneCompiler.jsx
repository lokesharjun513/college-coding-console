// frontend/src/pages/student/OneCompiler.jsx
//
// TEMPORARY EXPERIMENT — /student/onecompiler.
//
// A dedicated page for the embedded OneCompiler editor, so it can be opened and
// judged on its own instead of underneath the Free Console's own editor.
//
// This route IS the isolation boundary. There is no feature flag here on
// purpose: the page exists only for the trial, so removing it is deleting this
// file and the one route line in AppRoutes.jsx — no environment variable to
// unset and nothing to remember. (The separate flag-gated copy that still sits
// inside Free Console is a separate concern and keeps its own flag.)
//
// To remove:
//   1. delete this file
//   2. delete the `onecompiler` <Route> line and the import in AppRoutes.jsx
//
// WHAT THIS PAGE IS NOT
//   It is not connected to the platform. Code typed in the embedded frame stays
//   inside OneCompiler and is never sent here; runs are not recorded, timed or
//   associated with any student, submission or test case. It is a UI trial only.

import { Link } from 'react-router-dom';
// This page reuses the student page shell (`.fc-page`, `.fc-inner`,
// `.fc-visually-hidden`) and the shared `.student-breadcrumb` styles rather than
// duplicating them. Those rules live in FreeConsole.css, and the import is
// explicit so the page keeps its layout even if route-level code splitting
// ever stops pulling that stylesheet into the global bundle for us.
import './FreeConsole.css';
import OneCompilerEmbed from './OneCompilerEmbed';

export default function OneCompiler() {
  return (
    // `ocx-page` is the only thing that makes this route fill the viewport. It is
    // applied here rather than to `.fc-page` so Free Console's own layout, which
    // scrolls naturally, is untouched.
    <main className="fc-page ocx-page">
      <div className="fc-inner">
        <nav className="student-breadcrumb" aria-label="Breadcrumb">
          <Link className="student-breadcrumb__link" to="/student">Student</Link>
          <span className="student-breadcrumb__separator" aria-hidden="true">/</span>
          <span className="student-breadcrumb__current" aria-current="page">OneCompiler</span>
        </nav>

        {/* The breadcrumb already names the page, so the visible heading would be
            a duplicate. It stays in the document for screen readers and the
            document outline. */}
        <h1 className="fc-visually-hidden">OneCompiler editor</h1>

        <OneCompilerEmbed />
      </div>
    </main>
  );
}