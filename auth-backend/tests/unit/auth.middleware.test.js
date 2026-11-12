"use strict";

const { TEST_JWT_SECRET } = require("../helpers/env");

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { createFakeDb } = require("../helpers/fakeDb");
const { mockReq, mockRes, runChain, authCookieFrom } = require("../helpers/mocks");

const db = createFakeDb();
require("../../config/db").setPool(db.pool);

const controller = require("../../controllers/auth.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const {
    COOKIE_NAME,
    parseCookieHeader,
    getTokenFromCookieHeader,
    verifyAuthToken,
    signAuthToken
} = require("../../utils/token");

beforeEach(() => db.reset());

const SIGN = { algorithm: "HS256", issuer: "proxispeak", audience: "proxispeak-web" };
const now = () => Math.floor(Date.now() / 1000);

async function seedUser() {
    await runChain(
        [controller.register],
        mockReq({ body: { username: "jeevith", email: "jeevith@example.com", password: "password123" } }),
        mockRes()
    );
}

async function protectedCall(cookie) {
    const res = mockRes();
    const req = mockReq({ method: "GET", headers: cookie ? { cookie } : {} });
    let reached = false;

    await runChain([requireAuth, (rq, rs) => { reached = true; rs.json({ ok: true, user: rq.user, auth: rq.auth }); }], req, res);

    return { res, reached };
}

const withToken = (token) => `${COOKIE_NAME}=${token}`;

test("requireAuth: valid token reaches the handler with req.user and req.auth", async () => {
    await seedUser();

    const { token, jti, exp } = signAuthToken({ id: 1 });
    const { res, reached } = await protectedCall(withToken(token));

    assert.ok(reached);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.user, { id: 1, username: "jeevith", email: "jeevith@example.com" });
    assert.deepEqual(res.body.auth, { jti, exp });
});

test("requireAuth: no cookie -> 401 and the handler is never reached", async () => {
    const { res, reached } = await protectedCall(null);

    assert.equal(reached, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "AUTH_REQUIRED");
    assert.equal(res.cleared.length, 0);                   // nothing to clear
});

test("requireAuth: garbage token -> 401 TOKEN_INVALID and the bad cookie is cleared", async () => {
    for (const junk of ["garbage", "a.b.c", "....", "x".repeat(2000)]) {
        const { res, reached } = await protectedCall(withToken(junk));

        assert.equal(reached, false, junk.slice(0, 20));
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.code, "TOKEN_INVALID");
        assert.equal(res.cleared.length, 1);
    }
});

test("requireAuth: token signed with the WRONG secret -> 401", async () => {
    await seedUser();

    const forged = jwt.sign({}, "an-attacker-chosen-secret-0123456789-abcdef", {
        ...SIGN, subject: "1", jwtid: "forged", expiresIn: 3600
    });

    const { res, reached } = await protectedCall(withToken(forged));

    assert.equal(reached, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "TOKEN_INVALID");
});

test('requireAuth: unsigned "alg: none" token -> 401 (algorithm is pinned)', async () => {
    await seedUser();

    const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${part({ alg: "none", typ: "JWT" })}.${part({
        sub: "1", jti: "none-attack", iss: "proxispeak", aud: "proxispeak-web", exp: now() + 3600
    })}.`;

    const { res, reached } = await protectedCall(withToken(unsigned));

    assert.equal(reached, false);
    assert.equal(res.statusCode, 401);
});

test("requireAuth: EXPIRED token -> 401 TOKEN_EXPIRED", async () => {
    await seedUser();

    // exp in the past, correctly signed
    const expired = jwt.sign(
        { sub: "1", jti: "expired-jti", exp: now() - 60, iat: now() - 3660 },
        TEST_JWT_SECRET,
        SIGN
    );

    const { res, reached } = await protectedCall(withToken(expired));

    assert.equal(reached, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "TOKEN_EXPIRED");
    assert.equal(res.cleared.length, 1);
});

test("requireAuth: wrong issuer or audience -> 401", async () => {
    await seedUser();

    for (const override of [{ issuer: "someone-else" }, { audience: "another-app" }]) {
        const token = jwt.sign({}, TEST_JWT_SECRET, {
            ...SIGN, ...override, subject: "1", jwtid: "x", expiresIn: 3600
        });

        assert.equal((await protectedCall(withToken(token))).res.statusCode, 401);
    }
});

test("requireAuth: token missing required claims (sub / jti / exp) -> 401", async () => {
    await seedUser();

    const make = (payload, options = {}) =>
        jwt.sign(payload, TEST_JWT_SECRET, { ...SIGN, ...options });

    const tokens = [
        make({ jti: "no-sub" }, { expiresIn: 3600 }),                                  // no sub
        make({}, { subject: "1", expiresIn: 3600 }),                                    // no jti
        make({}, { subject: "1", jwtid: "no-exp" }),                                    // no exp
        make({}, { subject: "1; DROP TABLE users", jwtid: "x", expiresIn: 3600 }),      // non-numeric sub
        make({}, { subject: "-1", jwtid: "x", expiresIn: 3600 })
    ];

    for (const token of tokens) {
        const { res, reached } = await protectedCall(withToken(token));

        assert.equal(reached, false);
        assert.equal(res.statusCode, 401);
    }
});

test("requireAuth: valid signature but the user no longer exists -> 401", async () => {
    const { token } = signAuthToken({ id: 4242 });

    const { res, reached } = await protectedCall(withToken(token));

    assert.equal(reached, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "TOKEN_INVALID");
});

test("requireAuth: revoked (logged-out) token -> 401 TOKEN_REVOKED", async () => {
    await seedUser();

    const { token, jti, exp } = signAuthToken({ id: 1 });

    db.revoked.set(jti, { jti, user_id: 1, expires_at: exp });

    const { res } = await protectedCall(withToken(token));

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "TOKEN_REVOKED");
});

test("requireAuth: user info is re-read from MySQL each time (not trusted from the token)", async () => {
    await seedUser();

    const { token } = signAuthToken({ id: 1 });

    db.users[0].username = "renamed";

    const { res } = await protectedCall(withToken(token));

    assert.equal(res.body.user.username, "renamed");
});

test("requireAuth: the response never contains password_hash", async () => {
    await seedUser();

    const { token } = signAuthToken({ id: 1 });
    const { res } = await protectedCall(withToken(token));

    assert.ok(!JSON.stringify(res.body).includes("password"));
    assert.ok(!JSON.stringify(res.body).includes("$2"));
});

// ---------------- token + cookie helpers ----------------

test("verifyAuthToken never throws, whatever it is given", () => {
    for (const input of [undefined, null, "", 0, {}, [], "a", "a.b", "a.b.c", "\0\0", "é.é.é"]) {
        const result = verifyAuthToken(input);

        assert.equal(result.ok, false);
    }
});

test("parseCookieHeader handles multiple cookies, encoding, quotes and junk", () => {
    assert.deepEqual(parseCookieHeader("a=1; b=2"), { a: "1", b: "2" });
    assert.deepEqual(parseCookieHeader("a=hello%20world"), { a: "hello world" });
    assert.deepEqual(parseCookieHeader('a="quoted"'), { a: "quoted" });
    assert.deepEqual(parseCookieHeader("a=1; a=2"), { a: "1" });                  // first wins
    assert.deepEqual(parseCookieHeader("a=%E0%A4%A"), { a: "%E0%A4%A" });          // bad escape does not throw
    assert.deepEqual(parseCookieHeader("novalue; =x; b=2"), { b: "2" });
    assert.deepEqual(parseCookieHeader(undefined), {});
    assert.deepEqual(parseCookieHeader(""), {});
});

test("getTokenFromCookieHeader finds the auth cookie among others", () => {
    assert.equal(getTokenFromCookieHeader(`theme=dark; ${COOKIE_NAME}=abc.def.ghi; x=1`), "abc.def.ghi");
    assert.equal(getTokenFromCookieHeader("theme=dark"), null);
    assert.equal(getTokenFromCookieHeader(undefined), null);
});

test("each login gets a unique token id", () => {
    const a = signAuthToken({ id: 1 });
    const b = signAuthToken({ id: 1 });

    assert.notEqual(a.jti, b.jti);
    assert.notEqual(a.token, b.token);
    assert.ok(a.exp > now());
});

test("authCookieFrom helper reads what login set (sanity check of the harness)", async () => {
    await seedUser();

    const res = await runChain([controller.login], mockReq({ body: { email: "jeevith@example.com", password: "password123" } }), mockRes());

    assert.match(authCookieFrom(res), new RegExp(`^${COOKIE_NAME}=[\\w-]+\\.[\\w-]+\\.[\\w-]+$`));
});
