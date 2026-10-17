// frontend/src/components/common/RouteErrorBoundary.jsx
//
// Last-resort boundary for a single route's content.
//
// It exists for one reason: without it, any exception thrown while rendering
// unmounts the WHOLE React tree. In an SPA that is not a partial failure — the
// user gets a blank page with no explanation and no way back, because the
// navigation that would take them elsewhere was unmounted too.
//
// It does NOT hide anything:
//   - the error and its component stack are logged to the console in full;
//   - the message shown is derived from the real error, never a generic
//     "something went wrong" that would hide the cause;
//   - `Try again` re-mounts the subtree, and `Reload page` is the fallback when
//     the failure is deterministic.
//
// Place it INSIDE the shell (inside SaasLayout) so the sidebar and the mobile
// navigation survive — the point is to keep the user able to navigate away.

import React from 'react';
import PropTypes from 'prop-types';

export default class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleReset = this.handleReset.bind(this);
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Full fidelity: the console entry is what makes the failure diagnosable.
    // eslint-disable-next-line no-console
    console.error('[RouteErrorBoundary] render failed', error, info?.componentStack);
    this.props.onError?.(error, info);
  }

  handleReset() {
    this.setState({ error: null });
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const detail = error?.message || String(error);

    return (
      <div role="alert" style={{ padding: '32px', maxWidth: '720px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '20px', margin: '0 0 8px' }}>This page could not be displayed</h1>
        <p style={{ margin: '0 0 16px' }}>
          Something in this page failed to render. The details below are the real error, and
          they are also in the browser console.
        </p>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: 'rgba(180, 35, 24, 0.04)',
            border: '1px solid rgba(180, 35, 24, 0.22)',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '12px',
          }}
        >
          {detail}
        </pre>
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button type="button" className="sd-button sd-button--primary" onClick={this.handleReset}>
            Try again
          </button>
          <button type="button" className="sd-button sd-button--quiet" onClick={this.handleReload}>
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

RouteErrorBoundary.propTypes = {
  children: PropTypes.node,
  onError: PropTypes.func,
};