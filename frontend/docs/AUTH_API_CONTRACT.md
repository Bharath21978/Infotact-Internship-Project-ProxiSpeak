# ProxiSpeak Auth: proposed Frontend <-> Backend Contract (v1)

Status: **PROPOSED, pending Jeevith + team approval.** UI + validation can be developed now. This is **not** a completed authentication system until backend routes and WebSocket access checks are implemented.

## Endpoints (JSON)

- `POST /api/auth/register`: body `{ "username": "bharath", "email": "user@example.com", "password": "long-password" }` -> `201` with `{ "message": "Account created" }`. Do **not** return password hashes. Do not issue a session unless backend and frontend agree to automatic login (v1 assumes user must log in after registration).
- `POST /api/auth/login`: body `{ "email": "user@example.com", "password": "long-password" }` -> `200` with `{ "user": { "id": "...", "username": "...", "email": "..." } }`, plus `Set-Cookie` containing a secure session token in an **HttpOnly** cookie.
- `GET /api/auth/me`: -> `200` `{ "user": { "id": "...", "username": "...", "email": "..." } }` for valid session; `401` if not authenticated.
- `POST /api/auth/logout`: -> `200` `{ "message": "Logged out" }`; server invalidates session and clears cookie.

Errors use `{ "message": "..." }`, 400/401/409/500 as appropriate. Server must rate-limit auth requests, validate inputs, hash passwords using a reputable password hashing library (Argon2id or bcrypt), use parameterized DB queries, and avoid leaking account existence where feasible. Never put tokens/passwords in URL params, console logs, client localStorage, or git.

## Client configuration

Auth is **OFF by default**, so existing 3D demos don't break before backend is ready.
To preview the frontend auth screen, create `frontend/.env.local` (do not commit secrets):

```env
VITE_AUTH_ENABLED=true
# Optional. If omitted, requests use the frontend origin (/api/auth/*); configure a reverse proxy or Vite proxy in that case.
VITE_AUTH_API_BASE_URL=http://localhost:4000
```

Restart the Vite dev server after changing `.env.local`. With no backend API running, login will show a connection error; this is expected and **not** a working authentication login.

If backend is on a different origin, its CORS policy must allow the exact frontend origin with `credentials: true`. Frontend `fetch` uses `credentials: 'include'`. Cookie `SameSite` / `Secure` settings depend on deployment origin and HTTPS; prefer a same-origin `/api` reverse proxy for deployment.

## Real security checklist before production

1. Enforce authentication **server-side** on protected HTTP endpoints and at the Socket.IO connection/join events; a React gate alone is not a security boundary.
2. Bind socket identity to verified server-side session, never trust a client-provided user ID / room ID.
3. Avoid displaying the demo hard-coded member identity after login; replace it with authenticated `/api/auth/me` user data during integration.
4. CSRF protection for cookie-based state-changing actions (SameSite plus CSRF tokens where applicable), HTTPS, secure cookies, rate limiting, and login/logout tests.
5. Confirm exact API paths and response fields with Jeevith before enabling authentication in the shared project. New auth files are modular and do not change WebRTC logic.
