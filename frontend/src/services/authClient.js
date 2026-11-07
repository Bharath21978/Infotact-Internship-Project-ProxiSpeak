/**
 * Proposed cookie-session API contract; Jeevith must confirm exact paths/shapes.
 * NEVER persist passwords or authentication tokens in localStorage.
 */
const API_BASE = String(import.meta.env.VITE_AUTH_API_BASE_URL || '').replace(/\/$/, '');

export class AuthApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
  }
}

async function authRequest(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AuthApiError('Cannot reach the authentication server. Check that the backend is running.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback = response.status === 401 ? 'Incorrect credentials or expired session.'
      : response.status === 409 ? 'An account with these details already exists.'
      : 'Unable to complete the request. Please try again.';
    throw new AuthApiError(typeof data.message === 'string' && data.message.length < 200 ? data.message : fallback, response.status);
  }
  return data;
}

export async function currentUser() {
  const data = await authRequest('/api/auth/me');
  if (!data?.user?.id) throw new AuthApiError('Backend /api/auth/me must return { user: { id, username, email } }.');
  return data.user;
}

export function loginUser({ email, password }) {
  return authRequest('/api/auth/login', { method: 'POST', body: { email: email.trim(), password } });
}

export function registerUser({ username, email, password }) {
  return authRequest('/api/auth/register', {
    method: 'POST', body: { username: username.trim(), email: email.trim(), password },
  });
}

export function logoutUser() {
  return authRequest('/api/auth/logout', { method: 'POST' });
}
