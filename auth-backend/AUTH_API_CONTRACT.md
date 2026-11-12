# ProxiSpeak Authentication API Contract

Base URL (dev): `http://localhost:4000`  ·  Frontend origin (dev): `http://localhost:5173`

> **Response envelope is a backend decision.** The team agreed on the four endpoints and
> their request bodies; the response shapes below are what the backend implements.
> Bharath: confirm they suit the Login/Signup forms.

## Conventions

| | |
|---|---|
| Format | JSON in, JSON out (`Content-Type: application/json`) |
| Auth | HTTP-only cookie `proxispeak_token` containing a JWT. **The token is never in a response body**; frontend JavaScript cannot read it. |
| Success body | `{ "success": true, "message": "...", "user": { "id", "username", "email" } }` |
| Error body | `{ "success": false, "message": "...", "code": "SOME_CODE", "errors": { "field": "message" } }` (`errors` only for field problems) |
| Always sent | `Cache-Control: no-store` on `/api/auth/*` |

Every fetch must use `credentials: "include"`.

---

## 1. `POST /api/auth/register`

Request
```json
{ "username": "jeevith", "email": "jeevith@example.com", "password": "password123" }
```

| Rule | |
|---|---|
| username | 3–50 chars; letters (any language incl. Tamil/Hindi), digits, space, `.` `_` `-` |
| email | valid format, ≤ 100 chars; trimmed and lower-cased before storing |
| password | 8–72 **bytes** (bcrypt limit); not trimmed |

**201 Created**
```json
{ "success": true, "message": "Registration successful.",
  "user": { "id": 1, "username": "jeevith", "email": "jeevith@example.com" } }
```
Registration does **not** log the user in; call login next.

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing/invalid fields; `errors` lists each |
| 409 | `EMAIL_ALREADY_REGISTERED` | Email exists (case-insensitive) |
| 429 | `RATE_LIMITED` | Too many failed attempts from this IP |
| 503 | `DATABASE_UNAVAILABLE` | MySQL unreachable |

## 2. `POST /api/auth/login`

Request
```json
{ "email": "jeevith@example.com", "password": "password123" }
```

**200 OK** + `Set-Cookie: proxispeak_token=...; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`
```json
{ "success": true, "message": "Login successful.",
  "user": { "id": 1, "username": "jeevith", "email": "jeevith@example.com" } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing/malformed fields |
| 401 | `INVALID_CREDENTIALS` | Wrong password **or** unknown email (identical response on purpose) |
| 429 | `RATE_LIMITED` | Too many failed attempts (default 20 / 15 min / IP) |
| 503 | `DATABASE_UNAVAILABLE` | MySQL unreachable |

## 3. `GET /api/auth/me`

Needs the cookie. **200 OK**
```json
{ "success": true, "user": { "id": 1, "username": "jeevith", "email": "jeevith@example.com" } }
```

| Status | `code` | When |
|---|---|---|
| 401 | `AUTH_REQUIRED` | No cookie |
| 401 | `TOKEN_INVALID` | Bad signature / malformed / user deleted |
| 401 | `TOKEN_EXPIRED` | JWT past its expiry |
| 401 | `TOKEN_REVOKED` | User logged out with this token |
| 503 | `DATABASE_UNAVAILABLE` | MySQL unreachable |

On any 401 that had a cookie, the server also clears it. **Use this endpoint on page load** to
find out whether the user is logged in.

## 4. `POST /api/auth/logout`

No body. **200 OK**, cookie cleared:
```json
{ "success": true, "message": "Logged out successfully." }
```
Idempotent: returns 200 even if the session already expired. If the token was still valid it is
**revoked server-side** (stored in `revoked_tokens`), so a copied cookie stops working immediately,
and the user's live Socket.IO connections are closed. (503 if the revocation could not be saved;
the browser cookie is still cleared.)

---

## Other error codes

| Status | `code` | |
|---|---|---|
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 403 | `ORIGIN_NOT_ALLOWED` | POST from an origin not in `FRONTEND_ORIGINS` (CSRF defence) |
| 404 | `NOT_FOUND` | Unknown `/api/...` route |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 10 KB |
| 500 | `INTERNAL_ERROR` | Unexpected; details only in server log |

## Session strategy

Stateless signed JWT (HS256, claims: `sub`=user id, `jti`, `iat`, `exp`, `iss`, `aud`) in an HTTP-only cookie.
Lifetime = `JWT_EXPIRES_IN` (default 1 h, no refresh: users log in again). Logout adds the `jti` to the
`revoked_tokens` table until the token's own expiry. Checked on every `/me` and every Socket.IO handshake.

## Cookie configuration

| Attribute | Dev | Production |
|---|---|---|
| Name | `proxispeak_token` (`COOKIE_NAME`) | same |
| HttpOnly | yes | yes |
| Secure | `false` (`COOKIE_SECURE`) | **must be `true`** (server refuses to start otherwise) |
| SameSite | `Lax` (`COOKIE_SAMESITE`) | `Lax` if frontend & API share a site; `None` (+Secure) only if they are on different sites |
| Path | `/` | `/` |
| Max-Age | = `JWT_EXPIRES_IN` | same |

`localhost:5173` → `localhost:4000` is *same-site* (ports don't matter), which is why `Lax` works in development.

## CORS / CSRF

* CORS allows only `FRONTEND_ORIGINS`, with credentials.
* State-changing requests (`POST`) from an `Origin` not in that list are rejected with 403; requests
  flagged `Sec-Fetch-Site: cross-site` without an Origin are rejected too. Requests with no Origin at
  all (Postman, curl) are allowed, since they are not browser requests.
* Failed login/register attempts are rate-limited per IP (in-memory, single server instance).

---

## Database structure

See `database/schema.sql`.

`users`

| Column | Type | |
|---|---|---|
| id | INT | PK, auto-increment |
| username | VARCHAR(50) | NOT NULL |
| email | VARCHAR(100) | NOT NULL, **UNIQUE** |
| password_hash | VARCHAR(255) | NOT NULL (bcrypt, never plain text) |
| created_at | TIMESTAMP | default `CURRENT_TIMESTAMP` |

`revoked_tokens` (added for logout): `jti CHAR(36)` PK · `user_id INT` FK→users (cascade) ·
`expires_at BIGINT` (Unix seconds, = JWT `exp`) · `revoked_at TIMESTAMP`.

---

## Frontend integration (Bharath)

```javascript
const API = "http://localhost:4000";

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",                         // REQUIRED so the cookie is stored and sent
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message), data);   // data.code, data.errors
  return data;
}

await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username, email, password }) });
const { user } = await api("/api/auth/login",    { method: "POST", body: JSON.stringify({ email, password }) });
const me       = await api("/api/auth/me");                           // on app start
await api("/api/auth/logout", { method: "POST" });
```
Show `err.errors.email` / `err.errors.password` etc. under the matching form fields.
Do **not** store anything in `localStorage`; the cookie is the session.

### Socket.IO client

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:4000", { withCredentials: true });   // REQUIRED

socket.on("connect_error", (err) => {
  // err.message === "Authentication required"; err.data.code is AUTH_REQUIRED | TOKEN_EXPIRED |
  // TOKEN_REVOKED | TOKEN_INVALID | SERVICE_UNAVAILABLE  -> send the user to the login page
});

// NEW (optional) event: the server is about to close the socket.
socket.on("auth:expired", ({ reason }) => { /* "logout" | "token_expired" -> go to login */ });
```

**Required frontend changes**
1. Every `fetch` to `/api/...` uses `credentials: "include"`.
2. The Socket.IO client uses `withCredentials: true`.
3. **Log in before connecting the socket.** With `AUTH_ENABLED=true` an unauthenticated connection is refused,
   and Socket.IO does not retry after a refused handshake. Create the socket after login (or call `socket.connect()`).
4. Handle `connect_error` / `auth:expired` by showing the login screen.

**Unchanged:** every existing event name and payload (`player:join`, `player:move`, `player:leave`,
`players:update`, `rtc:offer`, `rtc:answer`, `rtc:ice-candidate`).

`test.html` in the repo is stale (it targets port 3000 and `avatar-move`/`avatar-update`, which the server
has never handled) and has no login cookie, so it cannot connect while `AUTH_ENABLED=true`.

## Socket.IO behaviour

1. Browsers on an `Origin` outside `FRONTEND_ORIGINS` are refused at the handshake (blocks cross-site WebSocket hijacking).
2. The handshake reads the HTTP-only cookie, verifies the JWT, checks it is not revoked and loads the user.
   Failure → `connect_error` (when `AUTH_ENABLED=true`).
3. The authenticated user is stored in `socket.data` (`user`, `userId`, `jti`, `tokenExp`).
4. Every incoming event (`player:*`, `rtc:*`) is re-checked: no identity or expired token → event dropped and socket closed.
5. A socket never outlives its token: it is closed at JWT expiry and on logout (`auth:expired` is sent first).

---

## MySQL setup

```bash
# 1. Install MySQL 8 (or MariaDB 10.5+) and make sure it is running.
# 2. Create the schema:
mysql -u root -p < database/schema.sql
# 3. Create a least-privilege app user (recommended instead of root):
mysql -u root -p -e "CREATE USER 'proxispeak_app'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
                     GRANT SELECT, INSERT, DELETE ON proxispeak.* TO 'proxispeak_app'@'localhost';"
```
Put the same user/password in `.env` (`DB_USER`, `DB_PASSWORD`).

Rithesh can verify database operations with:
```sql
USE proxispeak;
SELECT id, username, email, LEFT(password_hash, 7) AS hash_prefix, created_at FROM users;  -- hash_prefix looks like $2a$12$
SELECT * FROM revoked_tokens;                                                              -- filled by logout
```

## Postman

1. Create requests against `http://localhost:4000` (Postman keeps cookies automatically per domain).
2. `POST /api/auth/register`, Body → raw → JSON: `{"username":"jeevith","email":"jeevith@example.com","password":"password123"}` → expect **201**.
3. Repeat it → **409**. Send `{}` → **400**.
4. `POST /api/auth/login` with email + password → **200**. Open **Cookies** (under Send) → `proxispeak_token` should be **HttpOnly**.
5. `GET /api/auth/me` → **200** with your user.
6. `POST /api/auth/logout` → **200**; `GET /api/auth/me` again → **401**.
7. Wrong password → **401**; delete the cookie then `GET /me` → **401**.

Postman sends no `Origin` header, so the CSRF guard lets it through. To test the guard, add header `Origin: https://evil.example` to a POST → **403**.

## Player identity and rooms (contract change)

With `AUTH_ENABLED=true` the server ignores `player.id`, `player.name` and `player.role` in `player:join`.
It broadcasts, for each player: `id` = the authenticated user id (string, from the JWT), `name` = `users.username`
(from MySQL), `role` = `"Participant"` (there is no role column yet). `color`, `x` and `y` are still taken from the
client (validated). The event names and payload *shape* are unchanged, but the frontend must **not** rely on the
`id` it sent being echoed back: use `GET /api/auth/me` for the local user's id.
WebRTC `from` is always the sender's server-side socket id; a client-supplied `from` is ignored.

Rooms: set `ALLOWED_ROOM_IDS` (comma-separated, exact ids from the React app) to reject any other room id.
Left empty, any well-formed id (non-empty string, max 50 chars) is accepted. Every authenticated user may join any listed room.
