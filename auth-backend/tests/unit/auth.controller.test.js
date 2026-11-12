"use strict";

const { TEST_JWT_SECRET } = require("../helpers/env");

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { createFakeDb, connectionRefused } = require("../helpers/fakeDb");
const { mockReq, mockRes, runChain, authCookieFrom } = require("../helpers/mocks");

const db = createFakeDb();
require("../../config/db").setPool(db.pool);

const controller = require("../../controllers/auth.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const authEvents = require("../../utils/events");
const { COOKIE_NAME } = require("../../utils/token");

const jeevith = {
    username: "jeevith",
    email: "jeevith@example.com",
    password: "password123"
};

beforeEach(() => db.reset());

const post = (handler, body, extra = {}) =>
    runChain([handler], mockReq({ body, ...extra }), mockRes());

async function registerJeevith() {
    return post(controller.register, jeevith);
}

async function loginJeevith(password = jeevith.password) {
    return post(controller.login, { email: jeevith.email, password });
}

// ------------------------------------------------------------------
// API 1: POST /api/auth/register
// ------------------------------------------------------------------

test("register: success returns 201 and the public user only", async () => {
    const res = await registerJeevith();

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.user, {
        id: 1,
        username: "jeevith",
        email: "jeevith@example.com"
    });

    const wire = JSON.stringify(res.body);
    assert.ok(!wire.includes("password"));
    assert.ok(!wire.includes("$2"));
});

test("register: password is stored as a bcrypt hash, never plain text", async () => {
    await registerJeevith();

    const [stored] = db.users;

    assert.notEqual(stored.password_hash, jeevith.password);
    assert.ok(!stored.password_hash.includes(jeevith.password));
    assert.match(stored.password_hash, /^\$2[aby]\$\d{2}\$/);
    assert.equal(stored.password_hash.length, 60);
});

test("register: does not log the user in (no cookie)", async () => {
    const res = await registerJeevith();

    assert.equal(res.cookies.length, 0);
});

test("register: email is normalised before it is stored", async () => {
    await post(controller.register, { ...jeevith, email: "  JEEVITH@Example.COM " });

    assert.equal(db.users[0].email, "jeevith@example.com");
});

test("register: duplicate email -> 409 (also with different letter case)", async () => {
    await registerJeevith();

    for (const email of [jeevith.email, "JEEVITH@EXAMPLE.COM"]) {
        const res = await post(controller.register, { ...jeevith, email });

        assert.equal(res.statusCode, 409);
        assert.equal(res.body.code, "EMAIL_ALREADY_REGISTERED");
        assert.ok(res.body.errors.email);
    }

    assert.equal(db.users.length, 1);
});

test("register: race condition on the UNIQUE index still yields 409, not 500", async () => {
    // Request A already committed. Request B ran its existence check
    // BEFORE that commit (so it saw nothing), then its INSERT collides.
    await registerJeevith();

    const realExecute = db.pool.execute;

    db.pool.execute = async (sql, params) => {
        if (/^SELECT id FROM users/.test(sql.replace(/\s+/g, " "))) {
            return [[], []];                                // stale "no such email"
        }

        return realExecute(sql, params);
    };

    try {
        const res = await registerJeevith();

        assert.equal(res.statusCode, 409);
        assert.equal(res.body.code, "EMAIL_ALREADY_REGISTERED");
        assert.equal(db.users.length, 1);
    } finally {
        db.pool.execute = realExecute;
    }
});

test("register: missing fields -> 400 with per-field errors, nothing stored", async () => {
    for (const body of [undefined, {}, { username: "jeevith" }, { email: "a@b.co", password: "password123" }]) {
        const res = await post(controller.register, body);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.code, "VALIDATION_ERROR");
        assert.ok(Object.keys(res.body.errors).length > 0);
    }

    assert.equal(db.users.length, 0);
});

test("register: invalid values -> 400", async () => {
    const cases = [
        { ...jeevith, email: "not-an-email" },
        { ...jeevith, password: "short" },
        { ...jeevith, username: "ab" }
    ];

    for (const body of cases) {
        assert.equal((await post(controller.register, body)).statusCode, 400);
    }
});

test("register: every query is parameterised (no user input inside SQL text)", async () => {
    const nasty = {
        username: "x'; DROP TABLE users;--",   // fails validation, never reaches SQL
        email: "o'brien+tag@example.com",
        password: "pa'ss\"word;--123"
    };

    await post(controller.register, { ...nasty, username: "obrien" });
    await post(controller.login, { email: nasty.email, password: nasty.password });

    assert.ok(db.queries.length >= 3);

    for (const { sql } of db.queries) {
        assert.ok(!sql.includes("brien"), sql);
        assert.ok(!sql.includes("DROP"), sql);
        assert.ok(!sql.includes("pa'ss"), sql);
    }
});

// ------------------------------------------------------------------
// API 2: POST /api/auth/login
// ------------------------------------------------------------------

test("login: success -> 200, user info, HTTP-only cookie, token not in body", async () => {
    await registerJeevith();

    const res = await loginJeevith();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.user, { id: 1, username: "jeevith", email: "jeevith@example.com" });

    assert.equal(res.cookies.length, 1);

    const [cookie] = res.cookies;

    assert.equal(cookie.name, COOKIE_NAME);
    assert.equal(cookie.options.httpOnly, true);
    assert.equal(cookie.options.sameSite, "lax");
    assert.equal(cookie.options.path, "/");
    assert.equal(cookie.options.secure, false);          // NODE_ENV=test, plain http
    assert.equal(cookie.options.maxAge, 3600 * 1000);

    const wire = JSON.stringify(res.body);
    assert.ok(!wire.includes(cookie.value));
    assert.ok(!wire.includes("password"));
    assert.ok(!wire.includes(TEST_JWT_SECRET));
});

test("login: the JWT is signed, expiring, and carries only id/jti claims", async () => {
    await registerJeevith();

    const res = await loginJeevith();
    const claims = jwt.verify(res.cookies[0].value, TEST_JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: "proxispeak",
        audience: "proxispeak-web"
    });

    assert.equal(claims.sub, "1");
    assert.ok(claims.jti);
    assert.equal(claims.exp - claims.iat, 3600);

    // No PII or secrets inside the token.
    assert.ok(!("email" in claims));
    assert.ok(!("username" in claims));
    assert.ok(!("password_hash" in claims));
});

test("login: email lookup is case-insensitive and trimmed", async () => {
    await registerJeevith();

    const res = await post(controller.login, { email: "  JEEVITH@example.com ", password: jeevith.password });

    assert.equal(res.statusCode, 200);
});

test("login: wrong password -> 401, generic message, no cookie", async () => {
    await registerJeevith();

    const res = await loginJeevith("wrong-password");

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "INVALID_CREDENTIALS");
    assert.equal(res.cookies.length, 0);
});

test("login: unknown email -> the SAME 401 as a wrong password (no account enumeration)", async () => {
    await registerJeevith();

    const wrongPassword = await loginJeevith("wrong-password");
    const unknownEmail = await post(controller.login, { email: "nobody@example.com", password: "whatever123" });

    assert.equal(unknownEmail.statusCode, 401);
    assert.deepEqual(unknownEmail.body, wrongPassword.body);
    assert.equal(unknownEmail.cookies.length, 0);
});

test("login: unknown email still runs a full bcrypt comparison (timing equalisation)", async () => {
    const bcrypt = require("bcryptjs");
    const realCompare = bcrypt.compare;
    const hashesSeen = [];

    bcrypt.compare = async (plain, hash) => {
        hashesSeen.push(hash);
        return realCompare(plain, hash);
    };

    try {
        await post(controller.login, { email: "nobody@example.com", password: "whatever123" });
    } finally {
        bcrypt.compare = realCompare;
    }

    assert.equal(hashesSeen.length, 1);
    assert.match(hashesSeen[0], /^\$2[aby]\$\d{2}\$/);       // a real-looking bcrypt hash, not a shortcut
    assert.equal(hashesSeen[0].length, 60);
});

test("model: only login may read password_hash; findById/emailExists never return it", async () => {
    const User = require("../../models/user.model");

    await registerJeevith();

    assert.equal("password_hash" in (await User.findById(1)), false);
    assert.equal("password_hash" in (await User.findByEmail("jeevith@example.com")), true);
    assert.deepEqual(Object.keys(User.toPublicUser(await User.findByEmail("jeevith@example.com"))), ["id", "username", "email"]);
});

test("login: missing / malformed fields -> 400", async () => {
    for (const body of [undefined, {}, { email: "jeevith@example.com" }, { password: "x" }, { email: 5, password: [] }]) {
        const res = await post(controller.login, body);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.code, "VALIDATION_ERROR");
    }
});

// ------------------------------------------------------------------
// API 3: GET /api/auth/me   (controller + requireAuth)
// ------------------------------------------------------------------

async function me(cookie) {
    const headers = cookie ? { cookie } : {};

    return runChain([requireAuth, controller.me], mockReq({ method: "GET", headers }), mockRes());
}

test("me: valid session returns exactly id, username, email", async () => {
    await registerJeevith();

    const cookie = authCookieFrom(await loginJeevith());
    const res = await me(cookie);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        success: true,
        user: { id: 1, username: "jeevith", email: "jeevith@example.com" }
    });
});

test("me: no cookie -> 401 AUTH_REQUIRED", async () => {
    const res = await me(null);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "AUTH_REQUIRED");
});

// ------------------------------------------------------------------
// API 4: POST /api/auth/logout
// ------------------------------------------------------------------

test("logout: clears the cookie with matching attributes and answers 200", async () => {
    await registerJeevith();

    const cookie = authCookieFrom(await loginJeevith());
    const res = await runChain([controller.logout], mockReq({ headers: { cookie } }), mockRes());

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    assert.equal(res.cleared.length, 1);
    assert.equal(res.cleared[0].name, COOKIE_NAME);
    assert.equal(res.cleared[0].options.httpOnly, true);
    assert.equal(res.cleared[0].options.path, "/");
    assert.equal(res.cleared[0].options.sameSite, "lax");
});

test("logout: invalidates the session server-side (old token stops working)", async () => {
    await registerJeevith();

    const cookie = authCookieFrom(await loginJeevith());

    assert.equal((await me(cookie)).statusCode, 200);

    await runChain([controller.logout], mockReq({ headers: { cookie } }), mockRes());

    assert.equal(db.revoked.size, 1);

    // The attacker/replayed copy of the cookie is now useless.
    const replay = await me(cookie);

    assert.equal(replay.statusCode, 401);
    assert.equal(replay.body.code, "TOKEN_REVOKED");
});

test("logout: other sessions of the same user are unaffected", async () => {
    await registerJeevith();

    const first = authCookieFrom(await loginJeevith());
    const second = authCookieFrom(await loginJeevith());

    await runChain([controller.logout], mockReq({ headers: { cookie: first } }), mockRes());

    assert.equal((await me(first)).statusCode, 401);
    assert.equal((await me(second)).statusCode, 200);
});

test("logout: emits a logout event so live sockets can be closed", async () => {
    await registerJeevith();

    const cookie = authCookieFrom(await loginJeevith());
    const seen = [];
    const listener = (event) => seen.push(event);

    authEvents.on("logout", listener);

    try {
        await runChain([controller.logout], mockReq({ headers: { cookie } }), mockRes());
    } finally {
        authEvents.off("logout", listener);
    }

    assert.equal(seen.length, 1);
    assert.equal(seen[0].userId, 1);
    assert.ok(seen[0].jti);
});

test("logout: without a session (or with garbage) is still a clean 200", async () => {
    const none = await runChain([controller.logout], mockReq(), mockRes());
    const junk = await runChain(
        [controller.logout],
        mockReq({ headers: { cookie: `${COOKIE_NAME}=not.a.jwt` } }),
        mockRes()
    );

    for (const res of [none, junk]) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.cleared.length, 1);
    }

    assert.equal(db.revoked.size, 0);
});

test("logout: purges expired revocation rows opportunistically", async () => {
    await registerJeevith();

    db.revoked.set("stale-jti", { jti: "stale-jti", user_id: 1, expires_at: 1 });

    const cookie = authCookieFrom(await loginJeevith());

    await runChain([controller.logout], mockReq({ headers: { cookie } }), mockRes());
    await new Promise((resolve) => setImmediate(resolve));

    assert.ok(!db.revoked.has("stale-jti"));
    assert.equal(db.revoked.size, 1);                      // the fresh revocation stays
});

// ------------------------------------------------------------------
// Database failure
// ------------------------------------------------------------------

test("database down: every endpoint answers 503 without leaking internals", async () => {
    await registerJeevith();

    const cookie = authCookieFrom(await loginJeevith());

    db.fail(connectionRefused());

    const responses = [
        await post(controller.register, { ...jeevith, email: "new@example.com" }),
        await loginJeevith(),
        await me(cookie)
    ];

    for (const res of responses) {
        assert.equal(res.statusCode, 503);
        assert.equal(res.body.code, "DATABASE_UNAVAILABLE");

        const wire = JSON.stringify(res.body);
        assert.ok(!wire.includes("ECONNREFUSED"));
        assert.ok(!wire.includes("3306"));
        assert.ok(!wire.includes("127.0.0.1"));
    }
});

test("database down during logout: cookie is still cleared, caller is told (503)", async () => {
    await registerJeevith();

    const cookie = authCookieFrom(await loginJeevith());

    db.fail(connectionRefused());

    const res = await runChain([controller.logout], mockReq({ headers: { cookie } }), mockRes());

    assert.equal(res.cleared.length, 1);
    assert.equal(res.statusCode, 503);
});

test("database recovers: service works again without a restart", async () => {
    db.fail(connectionRefused());
    assert.equal((await registerJeevith()).statusCode, 503);

    db.recover();
    assert.equal((await registerJeevith()).statusCode, 201);
});

// ------------------------------------------------------------------
// Secrets never appear in logs
// ------------------------------------------------------------------

test("registration/login/errors never write passwords, hashes or secrets to the console", async () => {
    const captured = [];
    const originals = {};
    let tokenValue;

    for (const level of ["log", "info", "warn", "error"]) {
        originals[level] = console[level];
        console[level] = (...args) => captured.push(args.map(String).join(" "));
    }

    try {
        await registerJeevith();
        const ok = await loginJeevith();
        await loginJeevith("wrong-password");
        db.fail(connectionRefused());
        await loginJeevith();

        // The session token must not be logged either.
        tokenValue = ok.cookies[0].value;
    } finally {
        Object.assign(console, originals);
    }

    const output = captured.join("\n");

    assert.ok(tokenValue);
    assert.ok(!output.includes(tokenValue));

    assert.ok(!output.includes(jeevith.password));
    assert.ok(!output.includes("wrong-password"));
    assert.ok(!output.includes(TEST_JWT_SECRET));
    assert.ok(!output.includes("$2a$"));
});
