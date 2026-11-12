"use strict";

// NOT EXECUTED by the author: needs `npm install` (express, socket.io,
// bcryptjs, jsonwebtoken, mysql2, cors). Run with: npm run test:integration

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { startServer } = require("../helpers/server");
const { request, cookieFrom } = require("../helpers/httpClient");
const { connectionRefused } = require("../helpers/fakeDb");

const FRONTEND = "http://localhost:5173";
const user = { username: "jeevith", email: "jeevith@example.com", password: "password123" };

let s;

before(async () => { s = await startServer(); });
after(async () => { await s.close(); });

const api = (path, opts) => request(s.baseUrl, `/api/auth${path}`, { origin: FRONTEND, ...opts });

test("existing endpoints still work: GET / and GET /health", async () => {
    const root = await request(s.baseUrl, "/");
    assert.equal(root.status, 200);
    assert.equal(root.text, "ProxiSpeak Backend is Running!");

    const health = await request(s.baseUrl, "/health");
    assert.equal(health.status, 200);
    assert.equal(health.json.status, "ok");
    assert.equal(health.json.service, "ProxiSpeak Backend");
    assert.equal(health.json.database, "up");

    s.db.fail(connectionRefused());
    const down = await request(s.baseUrl, "/health");
    s.db.recover();

    assert.equal(down.status, 200);
    assert.equal(down.json.database, "down");
});

test("full flow over real HTTP: register -> login -> me -> logout -> me", async () => {
    const reg = await api("/register", { method: "POST", body: user });
    assert.equal(reg.status, 201);
    assert.deepEqual(reg.json.user, { id: 1, username: "jeevith", email: "jeevith@example.com" });

    const login = await api("/login", { method: "POST", body: { email: user.email, password: user.password } });
    assert.equal(login.status, 200);

    const header = login.setCookie.find((c) => c.startsWith("proxispeak_token="));
    assert.match(header, /HttpOnly/i);
    assert.match(header, /SameSite=Lax/i);
    assert.match(header, /Path=\//i);
    assert.match(header, /Max-Age=3600/i);
    assert.doesNotMatch(header, /Secure/i);                       // plain http in dev

    const cookie = cookieFrom(login);

    const me = await api("/me", { cookie });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.email, user.email);
    assert.equal(me.headers["cache-control"], "no-store");

    const out = await api("/logout", { method: "POST", cookie });
    assert.equal(out.status, 200);
    assert.match(out.setCookie.find((c) => c.startsWith("proxispeak_token=")), /(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);

    assert.equal((await api("/me", { cookie })).status, 401);        // replayed cookie is dead
});

test("duplicate email, bad input, wrong password, unknown email", async () => {
    assert.equal((await api("/register", { method: "POST", body: user })).status, 409);
    assert.equal((await api("/register", { method: "POST", body: {} })).status, 400);
    assert.equal((await api("/register", { method: "POST" })).status, 400);         // no body at all (Express 5: req.body undefined)

    const wrong = await api("/login", { method: "POST", body: { email: user.email, password: "nope-nope" } });
    const none = await api("/login", { method: "POST", body: { email: "x@y.co", password: "nope-nope" } });

    assert.equal(wrong.status, 401);
    assert.deepEqual(none.json, wrong.json);
});

test("/me without cookie, with garbage, forged and expired JWTs -> 401", async () => {
    assert.equal((await api("/me")).status, 401);
    assert.equal((await api("/me", { cookie: "proxispeak_token=garbage" })).status, 401);

    const claims = { algorithm: "HS256", issuer: "proxispeak", audience: "proxispeak-web" };
    const forged = jwt.sign({}, "wrong-secret-0123456789-abcdefghijklmnopqrstuv", { ...claims, subject: "1", jwtid: "f", expiresIn: 3600 });
    const now = Math.floor(Date.now() / 1000);
    const expired = jwt.sign({ sub: "1", jti: "e", exp: now - 60, iat: now - 3660 }, s.secret, claims);

    assert.equal((await api("/me", { cookie: `proxispeak_token=${forged}` })).status, 401);

    const res = await api("/me", { cookie: `proxispeak_token=${expired}` });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, "TOKEN_EXPIRED");
});

test("malformed JSON -> 400, unknown /api route -> 404, oversized body -> 413", async () => {
    const bad = await api("/login", { method: "POST", raw: "{not json" });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.code, "INVALID_JSON");

    assert.equal((await request(s.baseUrl, "/api/nope", { origin: FRONTEND })).status, 404);

    const huge = await api("/login", { method: "POST", body: { email: "a@b.co", password: "x".repeat(20000) } });
    assert.equal(huge.status, 413);
});

test("CORS: allowed origin gets credentials headers; preflight works; others get none", async () => {
    const ok = await request(s.baseUrl, "/api/auth/me", { origin: FRONTEND });
    assert.equal(ok.headers["access-control-allow-origin"], FRONTEND);
    assert.equal(ok.headers["access-control-allow-credentials"], "true");

    const preflight = await request(s.baseUrl, "/api/auth/login", {
        method: "OPTIONS",
        origin: FRONTEND,
        headers: { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" }
    });
    assert.ok([200, 204].includes(preflight.status));
    assert.equal(preflight.headers["access-control-allow-origin"], FRONTEND);
    assert.equal(preflight.headers["access-control-allow-credentials"], "true");

    const evil = await request(s.baseUrl, "/api/auth/me", { origin: "https://evil.example" });
    assert.equal(evil.headers["access-control-allow-origin"], undefined);
});

test("CSRF: POST from a foreign origin is refused before any work is done", async () => {
    const before = s.db.users.length;

    const res = await request(s.baseUrl, "/api/auth/register", {
        method: "POST",
        origin: "https://evil.example",
        body: { username: "mallory", email: "m@evil.example", password: "password123" }
    });

    assert.equal(res.status, 403);
    assert.equal(s.db.users.length, before);
});

test("database outage -> 503 JSON, no internals", async () => {
    s.db.fail(connectionRefused());

    const res = await api("/login", { method: "POST", body: { email: user.email, password: user.password } });

    s.db.recover();

    assert.equal(res.status, 503);
    assert.equal(res.json.code, "DATABASE_UNAVAILABLE");
    assert.doesNotMatch(res.text, /ECONNREFUSED|3306|127\.0\.0\.1/);
});

test("responses never contain the password, hash or JWT secret", async () => {
    const login = await api("/login", { method: "POST", body: { email: user.email, password: user.password } });
    const all = JSON.stringify([login.text, login.headers["x-powered-by"]]);

    assert.doesNotMatch(all, /password123|\$2[aby]\$|integration-test-jwt-secret/);
    assert.equal(login.headers["x-powered-by"], undefined);
});
