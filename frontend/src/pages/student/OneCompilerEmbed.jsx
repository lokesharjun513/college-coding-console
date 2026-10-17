// frontend/src/pages/student/OneCompilerEmbed.jsx
//
// TEMPORARY EXPERIMENT — /student/onecompiler, and the flag-gated copy in
// /student/freeconsole.
//
// Embeds the official OneCompiler editor (https://onecompiler.com/apis/embed-editor).
//
// DESIGN: the embed is left in charge of itself
//
// There is exactly one iframe, it is mounted once, and it is never hidden,
// unmounted, re-sourced or reloaded. Students get the editor, the language
// selector, the Run button and the output panel from OneCompiler's own UI, and
// they switch between editing and output by tapping OneCompiler's own Console
// tab. This page adds chrome and sizing; it does not reimplement the editor.
//
// WHY THE PARENT ADDS NO CHROME OF ITS OWN
//
// The editor, language selector, Run button, input (STDIN) and output panels all
// come from OneCompiler's own UI. The parent reimplements none of them, renders
// no program output, and reads no inbound events. Measured against the live
// service:
//
//   parent -> frame  -> 20 candidate eventTypes produced ZERO change in the
//                       frame's DOM. There is no view-switching event.
//   frame -> parent  -> clicking the embed's own Console / I/O tabs emits NO
//                       postMessage at all, so even detection is impossible.
//   x inside frame   -> none exists; no API to request one.
//
// A parent-side status line fed by the undocumented frame->parent events used to
// sit below the editor; it was removed on request, and the message listener with
// it. The frame is left entirely in charge of itself.
//
// SIZING
//   The frame fills the full width of its well (`width: 100%`), and its height is
//   flex-driven on the standalone route (see the stylesheet). The built-in input
//   and output sections are left visible — no `hideStdin` / `hideResult`.
//
// TO REMOVE THE EXPERIMENT
//   Turn the flag off. The component and stylesheet then become unreferenced and
//   can be deleted.

import { useEffect, useState } from 'react';
import './OneCompilerEmbed.css';

// Initialize src based on viewport to set appropriate fontSize for mobile
const getInitialSrc = () => {
  if (typeof window === 'undefined') {
    // SSR or default case - use desktop font size
    return 'https://onecompiler.com/embed/?theme=dark&listenToEvents=true&codeChangeEvent=true&hideEditorOptions=true&hideTitle=true&hideNew=true&hideNewFileOption=true&fontSize=14';
  }

  // If matchMedia is not available, default to desktop
  if (typeof window.matchMedia !== 'function') {
    return 'https://onecompiler.com/embed/?theme=dark&listenToEvents=true&codeChangeEvent=true&hideEditorOptions=true&hideTitle=true&hideNew=true&hideNewFileOption=true&fontSize=14';
  }

  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const fontSize = isMobile ? 12 : 14;
  return `https://onecompiler.com/embed/?theme=dark&listenToEvents=true&codeChangeEvent=true&hideEditorOptions=true&hideTitle=true&hideNew=true&hideNewFileOption=true&fontSize=${fontSize}`;
};

/**
 * The flag, read at call time.
 *
 * Exact match on "true" only: an experimental embed should never turn itself on
 * because of a loose truthy check on an env var.
 */
export function isOneCompilerEmbedEnabled() {
  return import.meta.env.VITE_USE_ONECOMPILER_TEST_EMBED === 'true';
}

export default function OneCompilerEmbed() {
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [src, setSrc] = useState(getInitialSrc);

  // Update src on window resize to adjust font size for mobile/desktop
  useEffect(() => {
    const handleResize = () => {
      setSrc(getInitialSrc());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /**
   * How long to wait for the frame's `load` before saying it may be blocked.
   *
   * Generous on purpose. Measured against the live embed on a cold start: the
   * frame's document reached `complete` at roughly 18s and its tab bar only
   * rendered at roughly 27s, with Monaco still reporting "Loading..." past 45s.
   * A short timeout here would report a healthy-but-slow editor as broken.
   *
   * It is also NOT destructive — see the fallback rendering below — so a slow load
   * costs the student a warning that disappears, not the editor itself.
   */
  const LOAD_TIMEOUT_MS = 20_000;

  // Load watchdog. Cleared on unmount and whenever the frame reports in, so the
  // timer never fires against an already-loaded frame.
  useEffect(() => {
    if (loaded) return undefined;
    const id = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [loaded]);

  return (
    <section className="ocx" aria-label="OneCompiler editor (experimental)">
      {/*
        The title/"Temporary test" bar and the explanatory paragraph were removed
        on request so the editor gets that height instead. The breadcrumb in
        OneCompiler.jsx still names the page.
      */}

      {/*
        The fallback is an ADVISORY, not a replacement.

        An earlier version swapped the iframe out for this message. Measured
        against the live embed, a cold frame can take ~18s to fire `load` and
        ~27s to paint its tabs, so on a slow connection that version destroyed a
        perfectly good editor and showed a false "did not load" error. The frame
        is therefore never unmounted: if it arrives late, `onLoad` fires, the
        notice disappears and the student never knew anything was wrong.
      */}
      {timedOut && !loaded ? (
        <p className="ocx__slow" role="status">
          OneCompiler&apos;s editor is taking longer than usual to load. It may be blocked by a
          network policy or extension — nothing is known about whether OneCompiler&apos;s run
          service is reachable. This notice clears itself if the editor arrives.
        </p>
      ) : null}

      <div className="ocx__frame-wrap">
        <iframe
          id="oc-editor"
          className="ocx__frame"
          title="OneCompiler Multi-Language Code Editor"
          src={src}
          width="100%"
          frameBorder="0"
          loading="lazy"
          onLoad={() => {
            setLoaded(true);
            setTimedOut(false);
          }}
        />
      </div>
    </section>
  );
}