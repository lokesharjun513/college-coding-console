import React from 'react';
import PropTypes from 'prop-types';
import BrandLogo from '../ui/BrandLogo';
import { CheckCircle2, ShieldCheck, Zap, Clock } from 'lucide-react';
import '../../styles/auth.css';

/**
 * AuthLayout – Full-viewport centered layout for auth pages with desktop split screen.
 */
export default function AuthLayout({ children }) {
  return (
    <main className="auth-layout" aria-label="Authentication">
      <div className="auth-layout__background-glows" aria-hidden="true">
        <div className="auth-layout__glow auth-layout__glow--sky" />
        <div className="auth-layout__glow auth-layout__glow--coral" />
      </div>
      <div className="auth-layout__wrapper">
        {/* Left branding area – visible on desktop >= 1200px */}
        <section className="auth-branding" aria-hidden="true">
          <div className="auth-branding__content">
            <BrandLogo size="lg" variant="dark" />
            <span className="auth-header__eyebrow" style={{ marginTop: '24px' }}>The Developer Learning Platform</span>
            <h1 className="auth-branding__title">
              Learn.<br />
              Practice.<br />
              <span className="auth-branding__title-highlight">Build.</span>
            </h1>
            <p className="auth-branding__subtitle">
              Sharpen your skills with real problems, personalized learning paths, and expert curated tracks.
            </p>

            {/* Product preview card */}
            <div className="auth-branding__preview-card">
              <div className="auth-branding__preview-header">
                <Clock size={20} />
                <span>Daily Practice</span>
              </div>
              <div className="auth-branding__preview-metrics">
                <div>
                  <div className="auth-branding__metric-value">04</div>
                  <div className="auth-branding__metric-label">Problems today</div>
                </div>
                <div>
                  <div className="auth-branding__metric-value">72 min</div>
                  <div className="auth-branding__metric-label">Practice time</div>
                </div>
              </div>
            </div>

            {/* Trust Features */}
            <div className="auth-branding__trust">
              <div className="auth-branding__trust-item">
                <ShieldCheck size={16} /> Secure
              </div>
              <div className="auth-branding__trust-item">
                <Zap size={16} /> Fast
              </div>
              <div className="auth-branding__trust-item">
                <CheckCircle2 size={16} /> Reliable
              </div>
            </div>
          </div>
        </section>

        {/* Right panel – the auth form */}
        <section className="auth-panel">
          <div className="auth-layout__content">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

AuthLayout.propTypes = {
  children: PropTypes.node.isRequired,
};
