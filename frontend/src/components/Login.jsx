import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from './auth/AuthLayout';
import AuthCard from './auth/AuthCard';
import AuthHeader from './auth/AuthHeader';
import AuthError from './auth/AuthError';
import AuthInput from './auth/AuthInput';
import PasswordInput from './auth/PasswordInput';
import AuthButton from './auth/AuthButton';
import BrandLogo from './ui/BrandLogo';
import Spinner from './ui/Spinner';
import '../styles/auth.css';

export default function Login() {
  const { login, user, loading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect authenticated users after render
  useEffect(() => {
    if (isAuthenticated && user?.role) {
      const target =
        user.role === 'ADMIN' ? '/admin' :
        user.role === 'TRAINER' ? '/trainer' : '/student';
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, user?.role, navigate]);

  if (isAuthenticated && user?.role) {
    return (
      <div className="auth-state-screen"
        aria-live="polite"
        aria-label="Redirecting to your dashboard"
      >
        <Spinner size={24} />
      </div>
    );
  }

  // ── Show loading state while session is being restored ─
  if (authLoading) {
    return (
      <div className="auth-state-screen"
        aria-live="polite"
        aria-label="Checking your session"
      >
        <Spinner size={24} />
      </div>
    );
  }

  // ── Handle form submission ──────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid credentials. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <section className="login-page" aria-label="Sign in">
        <div className="login-page__content">
          <AuthCard>
            <div className="auth-card__logo">
              <BrandLogo size="sm" variant="dark" />
            </div>

            <AuthHeader
              eyebrow="Welcome back"
              heading="Sign in to your account"
              subtext="Enter your credentials to continue."
            />

            <form
              className="auth-form"
              onSubmit={handleSubmit}
              noValidate
            >
              <AuthError message={error} />

              <AuthInput
                id="email"
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isSubmitting}
              />

              <PasswordInput
                id="password"
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />

              <div className="auth-form__actions">
                <label className="auth-form__remember">
                  <input
                    type="checkbox"
                    className="auth-form__remember-input"
                    tabIndex={0}
                  />
                  <span className="auth-form__remember-label">Remember me</span>
                </label>
                <button
                  type="button"
                  className="auth-form__forgot"
                  tabIndex={0}
                >
                  Forgot password?
                </button>
              </div>

              <AuthButton loading={isSubmitting} label="Sign in" />
            </form>
          </AuthCard>
        </div>
      </section>
    </AuthLayout>
  );
}
