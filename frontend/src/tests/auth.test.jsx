/* global vi, describe, test, expect, beforeEach */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import Login from '../components/Login';
import api from '../api';

// Mock the api module
vi.mock('../api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

describe('Auth flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('successful login stores token and redirects', async () => {
    const mockToken = 'test-jwt';
    const mockUser = { name: 'Test User', role: 'ADMIN' };
    // Mock login POST
    api.post.mockResolvedValueOnce({ data: { token: mockToken } });
    // Mock api.get after login (AuthContext.login() fetches user)
    api.get.mockResolvedValueOnce({ data: { user: mockUser } });

    const TestComponent = () => {
      const { user, isAuthenticated } = useAuth();
      return (
        <div>
          {isAuthenticated ? <span>{user?.name}</span> : <span>Not Auth</span>}
        </div>
      );
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Login />} />
          </Routes>
          <TestComponent />
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    await waitFor(() => expect(screen.getByText('Test User')).toBeInTheDocument());
    expect(localStorage.getItem('token')).toBe(mockToken);
  });

  test('login failure shows error', async () => {
    // Mock restoreSession to reject immediately so Login form renders
    api.get.mockResolvedValueOnce({ response: { status: 401 } });
    api.post.mockRejectedValueOnce({ response: { data: { message: 'Invalid credentials' } } });
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/admin" element={<div>Admin Page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'bad@example.com' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));
    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument());
  });
});
