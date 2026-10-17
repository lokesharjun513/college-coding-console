// The Student route error boundary.
//
// Two properties are asserted: an unexpected render error produces a readable,
// logged fallback instead of an unmounted tree, and the shell around it survives
// so the student can navigate away. The boundary must never be used to conceal a
// real defect, so the test also asserts the real error reaches the console.

import React from 'react';
import { vi, beforeEach, afterEach, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RouteErrorBoundary from './RouteErrorBoundary';

const Boom = ({ explode }) => {
  if (explode) throw new Error('Render exploded: missing problem id');
  return <p>Content is fine</p>;
};

let consoleError;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('renders its children while nothing throws', () => {
  render(
    <RouteErrorBoundary>
      <Boom />
    </RouteErrorBoundary>,
  );
  expect(screen.getByText('Content is fine')).toBeInTheDocument();
});

test('a render error shows a readable fallback instead of unmounting the tree', () => {
  render(
    <div data-testid="shell">
      <RouteErrorBoundary>
        <Boom explode />
      </RouteErrorBoundary>
    </div>,
  );

  // The surrounding shell survives: this is what keeps navigation available.
  expect(screen.getByTestId('shell')).toBeInTheDocument();

  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('This page could not be displayed');
  // The real cause, not a generic message.
  expect(alert).toHaveTextContent('Render exploded: missing problem id');
});

test('the error is logged in full rather than swallowed', () => {
  render(
    <RouteErrorBoundary>
      <Boom explode />
    </RouteErrorBoundary>,
  );

  // React logs its own boundary report first; the boundary's own entry is the
  // one that carries the full Error object and component stack.
  const own = consoleError.mock.calls.find(([tag]) => tag === '[RouteErrorBoundary] render failed');
  expect(own).toBeDefined();

  const [, error, info] = own;
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe('Render exploded: missing problem id');
  // React passes its per-frame stack alongside the error; the boundary forwards
  // it rather than logging a bare message.
  expect(info).toBeDefined();
});

test('onError receives the error so callers can report it', () => {
  const onError = vi.fn();
  render(
    <RouteErrorBoundary onError={onError}>
      <Boom explode />
    </RouteErrorBoundary>,
  );
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0][0].message).toBe('Render exploded: missing problem id');
});

test('Try again re-renders the subtree', async () => {
  // Flipping the flag models the "recovered" case a retry is meant to produce.
  let explode = true;
  const Flaky = () => {
    if (explode) throw new Error('Render exploded: missing problem id');
    return <p>Content is fine</p>;
  };

  render(
    <RouteErrorBoundary>
      <Flaky />
    </RouteErrorBoundary>,
  );
  expect(screen.getByRole('alert')).toBeInTheDocument();

  explode = false;
  await userEvent.click(screen.getByRole('button', { name: /try again/i }));

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('Content is fine')).toBeInTheDocument();
});

test('Reload page is offered as the fallback', () => {
  render(
    <RouteErrorBoundary>
      <Boom explode />
    </RouteErrorBoundary>,
  );
  expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
});