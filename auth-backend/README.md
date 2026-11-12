# ProxiSpeak Backend

Express + Socket.IO (multiplayer, WebRTC signalling) with MySQL-backed authentication.
API details: **[AUTH_API_CONTRACT.md](AUTH_API_CONTRACT.md)**.

## Setup

```bash
npm ci                         # installs exactly what package-lock.json lists
cp .env.example .env          # Windows: copy .env.example .env
# edit .env: set DB_PASSWORD and JWT_SECRET. Generate a secret with:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
mysql -u root -p < database/schema.sql      # see MySQL setup in AUTH_API_CONTRACT.md
npm start                      # http://localhost:4000   (npm run dev = auto-restart)
```
The server refuses to start (with a list of what is wrong) if `JWT_SECRET` is missing, short, or still the placeholder.
If MySQL is unreachable it still starts; `GET /health` reports `"database": "down"` and auth endpoints return 503.

## Tests

```bash
npm test                  # everything
npm run test:unit         # no database, no network needed
npm run test:integration  # real Express + Socket.IO, fake MySQL pool
```
Neither suite needs a real MySQL server.

## Layout

```
server.js                    existing app + auth wiring (event handlers unchanged)
config/        env.js (validation) · index.js · db.js (pool)
routes/ controllers/ middleware/ models/ utils/   authentication
sockets/socketAuth.js        Socket.IO authentication
database/schema.sql          MySQL schema
tests/unit · tests/integration · tests/helpers
```

## Notes
* `bcryptjs` (pure JavaScript, same bcrypt algorithm and hash format) is used instead of native `bcrypt` so installs never need a C++ build toolchain on Windows.
* **`package-lock.json` is stale**: it does not list mysql2, bcryptjs, jsonwebtoken or dotenv, so `npm ci` will fail until it is regenerated.
  On a machine with internet access run `npm install` once, confirm `npm ci` succeeds, then commit the new lockfile.
* Cookies are parsed by a small built-in parser (`utils/token.js`), so `cookie-parser` is intentionally not a dependency.
* Real room ids live in the frontend: copy them into `ALLOWED_ROOM_IDS` in `.env` to restrict joins.
* Manual testing: serve `test.html` on port 5173 (`npx serve -l 5173 .`), see the instructions at the top of the page.
* Never commit `.env`.
