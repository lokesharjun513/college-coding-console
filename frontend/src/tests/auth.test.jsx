import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import Login from '../components/Login';
import api from '../api';

// Mock the api module
vi.mock('../api', () => {
  return {
    default: {
      post: vi.fn(),
      get: vi.fn(),
    },
  };
});

describe('Auth flow', () => {
  test('successful login stores token and redirects', async () => {
    const mockToken = 'test-jwt';
    const mockUser = { name: 'Test User', role: 'ADMIN' };
    api.post.mockResolvedValueOnce({ data: { token: mockToken } });
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
      <AuthProvider>
        <Login />
        <TestComponent />
      </AuthProvider>
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => expect(screen.getByText('Test User')).toBeInTheDocument());
    expect(localStorage.getItem('token')).toBe(mockToken);
  });

  test('login failure shows error', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { message: 'Invalid credentials' } } });
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bad@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument());
  });
});
