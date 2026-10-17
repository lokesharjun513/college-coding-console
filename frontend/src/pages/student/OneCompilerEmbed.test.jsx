// Tests for student/OneCompilerEmbed.jsx — the TEMPORARY OneCompiler embed.
//
// Pinned here, because this component must NOT reimplement the editor:
//
//   - the embed owns its own input (STDIN) and output sections; the parent
//     neither hides them nor reimplements them (no hideStdin / hideResult);
//   - the lightweight chrome is hidden via supported params: the New button,
//     the new-file option, the options icon and the title;
//   - there is exactly one iframe, it is never hidden, unmounted or re-sourced,
//     so the editor keeps its buffer, language and undo history;
//   - there is NO parent-side terminal, no custom x, no view swapping and no
//     parent-side status line — the student uses OneCompiler's own tabs;
//   - the parent never posts to the frame, so there is no target origin to get
//     wrong.
//
// What this file deliberately does NOT claim: that the parent can hide the
// Files/Search sidebar or switch the embed's internal view. No supported
// parameter exists for either. See the header of OneCompilerEmbed.jsx.

import { vi, afterEach, beforeEach, test, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import OneCompilerEmbed, { isOneCompilerEmbedEnabled } from './OneCompilerEmbed';

const EMBED_SRC =
  'https://onecompiler.com/embed/?theme=dark&listenToEvents=true&codeChangeEvent=true&hideEditorOptions=true&hideTitle=true&hideNew=true&hideNewFileOption=true&fontSize=14';

const frame = () => document.getElementById('oc-editor');

const renderPanel = () => render(<OneCompilerEmbed />);

const markLoaded = () => act(() => { fireEvent.load(frame()); });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// -- the flag ------------------------------------------------------------

test('the panel is off unless the flag is exactly "true"', () => {
  vi.stubEnv('VITE_USE_ONECOMPILER_TEST_EMBED', undefined);
  expect(isOneCompilerEmbedEnabled()).toBe(false);

  for (const loose of ['false', '1', 'yes', 'TRUE', ' true', 'on', '']) {
    vi.stubEnv('VITE_USE_ONECOMPILER_TEST_EMBED', loose);
    expect(isOneCompilerEmbedEnabled()).toBe(false);
  }

  vi.stubEnv('VITE_USE_ONECOMPILER_TEST_EMBED', 'true');
  expect(isOneCompilerEmbedEnabled()).toBe(true);
});

// -- embed configuration -------------------------------------------------

test('the embed keeps its built-in input and output sections', () => {
  renderPanel();
  const src = new URL(frame().getAttribute('src'));

  // Pinned in full: any future edit to this URL has to be a deliberate,
  // reviewed change, because the params decide what the student can see.
  expect(frame().getAttribute('src')).toBe(EMBED_SRC);

  expect(src.origin + src.pathname).toBe('https://onecompiler.com/embed/');
  // Built-in input (STDIN) and output sections are left visible.
  expect(src.searchParams.has('hideStdin')).toBe(false);
  expect(src.searchParams.has('hideResult')).toBe(false);
  // Everything the student still needs is kept.
  expect(src.searchParams.get('theme')).toBe('dark');
  expect(src.searchParams.get('listenToEvents')).toBe('true');
  expect(src.searchParams.get('codeChangeEvent')).toBe('true');
  expect(src.searchParams.has('hideRun')).toBe(false);
  expect(src.searchParams.has('hideLanguageSelection')).toBe(false);
  // Simplified chrome: New button, new-file option, options icon and title are
  // all hidden via supported OneCompiler params.
  expect(src.searchParams.get('hideNew')).toBe('true');
  expect(src.searchParams.get('hideNewFileOption')).toBe('true');
  expect(src.searchParams.get('hideEditorOptions')).toBe('true');
  expect(src.searchParams.get('hideTitle')).toBe('true');
  // No supported parameter hides the Files/Search sidebar; not attempted here.
  expect(src.searchParams.has('hideSidebar')).toBe(false);
});

test('the iframe carries the required identity, sizing and loading attributes', () => {
  renderPanel();
  const el = frame();

  expect(el).not.toBeNull();
  expect(el.tagName).toBe('IFRAME');
  expect(el.getAttribute('id')).toBe('oc-editor');
  expect(el.getAttribute('title')).toBe('OneCompiler Multi-Language Code Editor');
  expect(el.getAttribute('width')).toBe('100%');
  expect(el.getAttribute('frameBorder') ?? el.getAttribute('frameborder')).toBe('0');
  expect(el.getAttribute('loading')).toBe('lazy');
});

test('the iframe carries no fixed pixel height, so CSS can size it to the viewport', () => {
  renderPanel();
  // A literal height would win over CSS and reintroduce fixed-height overflow.
  expect(frame().hasAttribute('height')).toBe(false);
  expect(frame().style.height).toBe('');
});

// -- hybrid UX: no parent-side terminal ----------------------------------

test('no parent-side terminal, custom close control or view swapping exists', () => {
  renderPanel();

  // The student uses OneCompiler's own UI. This page must not shadow it.
  expect(screen.queryByRole('region', { name: /execution output/i })).toBeNull();
  expect(screen.queryByRole('region', { name: /program input/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /close terminal/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /run code/i })).toBeNull();
  expect(document.querySelector('.ocx__terminal')).toBeNull();
  expect(document.querySelector('.ocx__frame-wrap--hidden')).toBeNull();
});

test('the frame is never hidden, and is never re-sourced', () => {
  renderPanel();
  markLoaded();

  const before = frame();
  const srcBefore = before.getAttribute('src');

  expect(frame()).toBe(before);                                   // same node
  expect(frame().getAttribute('src')).toBe(srcBefore);           // same src
  expect(frame().parentElement.className).toBe('ocx__frame-wrap'); // not hidden
  expect(document.querySelectorAll('iframe')).toHaveLength(1);
});

test('this page never posts to the frame, so there is no target origin to get wrong', () => {
  renderPanel();
  const win = frame().contentWindow;
  const postMessage = vi.fn();
  win.postMessage = postMessage;

  markLoaded();

  expect(postMessage).not.toHaveBeenCalled();
});

// -- frame loading -------------------------------------------------------

test('a slow frame gets an advisory notice but is NEVER unmounted', () => {
  vi.useFakeTimers();
  renderPanel();

  const original = frame();
  expect(original).not.toBeNull();

  // Measured against the live embed, a cold frame can take ~18s to fire load
  // and ~27s to paint. An earlier version unmounted the iframe here and showed
  // a hard "did not load" error, destroying a healthy editor on a slow network.
  // These intermediate ticks are the point: the threshold must NOT be so low
  // that a normal cold start trips it.
  act(() => vi.advanceTimersByTime(8_000));
  expect(screen.queryByRole('status')).toBeNull();

  act(() => vi.advanceTimersByTime(6_000));   // 14s
  expect(screen.queryByRole('status')).toBeNull();

  act(() => vi.advanceTimersByTime(6_000));   // 20s
  const notice = screen.getByRole('status');
  expect(notice.textContent).toMatch(/taking longer than usual/i);
  // Says nothing about whether OneCompiler's run service is reachable.
  expect(notice.textContent).toMatch(/onecompiler's run service is reachable/i);
  // The critical part: same node, still in the document.
  expect(frame()).toBe(original);
  expect(document.querySelectorAll('iframe')).toHaveLength(1);
  expect(frame().hasAttribute('src')).toBe(true);
});

test('the advisory clears itself once a late frame arrives', () => {
  vi.useFakeTimers();
  renderPanel();

  const original = frame();
  act(() => vi.advanceTimersByTime(20_000));
  expect(screen.queryByRole('status')).not.toBeNull();

  // The frame arrives late. Nothing was lost, and the notice goes away.
  act(() => { fireEvent.load(frame()); });

  expect(screen.queryByRole('status')).toBeNull();
  expect(frame()).toBe(original);
});

test('the load watchdog is cleared once the frame loads', () => {
  vi.useFakeTimers();
  renderPanel();

  fireEvent.load(frame());
  act(() => vi.advanceTimersByTime(120_000));

  expect(screen.queryByRole('status')).toBeNull();
  expect(frame()).not.toBeNull();
});

// -- page chrome ---------------------------------------------------------

test('the title bar, explanatory paragraph, footer and attribution are gone', () => {
  renderPanel();

  expect(screen.getByRole('region', { name: /onecompiler editor \(experimental\)/i })).toBeInTheDocument();

  // Removed on request. The breadcrumb in OneCompiler.jsx still names the page.
  expect(screen.queryByText(/^temporary test$/i)).toBeNull();
  expect(screen.queryByText(/^OneCompiler editor$/i)).toBeNull();
  expect(screen.queryByText(/not tracked, timed or recorded/i)).toBeNull();
  expect(screen.queryByText(/input and output panels/i)).toBeNull();
  expect(document.querySelector('.ocx__bar')).toBeNull();
  expect(document.querySelector('.ocx__notice')).toBeNull();

  // The footer (status line + attribution link) was removed on request.
  expect(document.querySelector('.ocx__foot')).toBeNull();
  expect(document.querySelector('.ocx__stat')).toBeNull();
  expect(screen.queryByText(/No run observed yet\./)).toBeNull();
  expect(screen.queryByRole('link', { name: /onecompiler/i })).toBeNull();

  // The frame is now the only thing in the panel, and still fills it.
  expect(frame()).not.toBeNull();
  expect(document.querySelector('.ocx__frame-wrap')).toBe(frame().parentElement);
});
