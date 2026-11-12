"use strict";

const { TEST_JWT_SECRET } = require("../helpers/env");

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { createFakeDb, connectionRefused } = require("../helpers/fakeDb");
const { mockReq, mockRes, runChain, authCookieFrom, fakeSocket, sendPacket, runHandshake } = require("../helpers/mocks");

const db = createFakeDb();
require("../../config/db").setPool(db.pool);

const controller = require("../../controllers/auth.controller");
const authEvents = require("../../utils/events");
const { COOKIE_NAME, signAuthToken } = require("../../utils/token");
const socketAuth = require("../../sockets/socketAuth");

const SIGN = { algorithm: "HS256", issuer: "proxispeak", audience: "proxispeak-web" };
const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => db.reset());

// Silence the intentional "Rejected ..." log lines.
function quiet() {
    const saved = { log: console.log, error: console.error };
    console.log = () => {};
    console.error = () => {};
    return () => Object.assign(console, saved);
}

async function loginCookie() {
    await runChain([controller.register], mockReq({ body: { username: "jeevith", email: "jeevith@example.com", password: "password123" } }), mockRes());

    const res = await runChain([controller.login], mockReq({ body: { email: "jeevith@example.com", password: "password123" } }), mockRes());

    return authCookieFrom(res);
}

async function authedSocket(extra = {}) {
    const cookie = await loginCookie();
    const socket = fakeSocket({ cookie, ...extra });

    assert.equal(await runHandshake(socketAuth.authMiddleware, socket), null);
    socketAuth.protectSocket(socket);

    return socket;
}

// ------------------------------------------------------------------
// handshake
// ------------------------------------------------------------------

test("handshake: valid cookie is accepted and the user is attached to the socket", async () => {
    const cookie = await loginCookie();
    const socket = fakeSocket({ cookie });

    const error = await runHandshake(socketAuth.authMiddleware, socket);

    assert.equal(error, null);
    assert.deepEqual(socket.data.user, { id: 1, username: "jeevith", email: "jeevith@example.com" });
    assert.equal(socket.data.userId, 1);
    assert.ok(socket.data.jti);
    assert.ok(socket.data.tokenExp > now());
});

test("handshake: other cookies in the header do not confuse it", async () => {
    const cookie = await loginCookie();
    const socket = fakeSocket({ cookie: `theme=dark; ${cookie}; lang=en` });

    assert.equal(await runHandshake(socketAuth.authMiddleware, socket), null);
    assert.equal(socket.data.userId, 1);
});

test("handshake: no cookie -> rejected with AUTH_REQUIRED", async () => {
    const restore = quiet();

    try {
        const error = await runHandshake(socketAuth.authMiddleware, fakeSocket());

        assert.ok(error instanceof Error);
        assert.equal(error.message, "Authentication required");
        assert.equal(error.data.code, "AUTH_REQUIRED");
    } finally {
        restore();
    }
});

test("handshake: invalid, forged, expired and revoked tokens are all rejected", async () => {
    await loginCookie();                                       // creates user 1

    const expired = jwt.sign({ sub: "1", jti: "e", exp: now() - 30, iat: now() - 3630 }, TEST_JWT_SECRET, SIGN);
    const forged = jwt.sign({}, "attacker-secret-0123456789-abcdefghijklmnop", { ...SIGN, subject: "1", jwtid: "f", expiresIn: 3600 });
    const revoked = signAuthToken({ id: 1 });

    db.revoked.set(revoked.jti, { jti: revoked.jti, user_id: 1, expires_at: revoked.exp });

    const cases = [
        ["not-a-jwt", "TOKEN_INVALID"],
        [forged, "TOKEN_INVALID"],
        [expired, "TOKEN_EXPIRED"],
        [revoked.token, "TOKEN_REVOKED"],
        [signAuthToken({ id: 9999 }).token, "TOKEN_INVALID"]    // user no longer exists
    ];

    const restore = quiet();

    try {
        for (const [token, code] of cases) {
            const socket = fakeSocket({ cookie: `${COOKIE_NAME}=${token}` });
            const error = await runHandshake(socketAuth.authMiddleware, socket);

            assert.ok(error, code);
            assert.equal(error.data.code, code);
            assert.equal(socket.data.user, undefined);
        }
    } finally {
        restore();
    }
});

test("handshake: database outage fails CLOSED (rejects) when auth is enforced", async () => {
    const cookie = await loginCookie();

    db.fail(connectionRefused());

    const restore = quiet();

    try {
        const error = await runHandshake(socketAuth.authMiddleware, fakeSocket({ cookie }));

        assert.ok(error);
        assert.equal(error.data.code, "SERVICE_UNAVAILABLE");
        assert.ok(!error.message.includes("ECONNREFUSED"));
    } finally {
        restore();
    }
});

// ------------------------------------------------------------------
// per-packet guard
// ------------------------------------------------------------------

test("guard: authenticated socket may send any event", async () => {
    const socket = await authedSocket();

    for (const event of ["player:join", "player:move", "player:leave", "rtc:offer", "rtc:answer", "rtc:ice-candidate"]) {
        assert.equal((await sendPacket(socket, event)).delivered, true, event);
    }
});

test("guard: a socket without identity cannot run player:join or rtc:* (defence in depth)", async () => {
    const restore = quiet();

    try {
        const socket = fakeSocket();                           // never authenticated
        socketAuth.protectSocket(socket);

        for (const event of ["player:join", "rtc:offer", "rtc:answer", "rtc:ice-candidate", "player:move"]) {
            const fresh = fakeSocket();
            socketAuth.protectSocket(fresh);

            const result = await sendPacket(fresh, event, { roomId: "studio" });

            assert.equal(result.delivered, false, event);
            assert.equal(result.error.data.code, "AUTH_REQUIRED");
            assert.equal(fresh.connected, false);              // and it is disconnected
        }
    } finally {
        restore();
    }
});

test("guard: packets from an expired session are dropped and the socket is closed", async () => {
    const socket = await authedSocket();
    const restore = quiet();

    try {
        socket.data.tokenExp = now() - 1;                      // token expired mid-connection

        const result = await sendPacket(socket, "player:move", { x: 1, y: 1 });

        assert.equal(result.delivered, false);
        assert.equal(result.error.data.code, "TOKEN_EXPIRED");
        assert.equal(socket.connected, false);
        assert.deepEqual(socket.eventsNamed("auth:expired"), [{ reason: "token_expired" }]);
    } finally {
        restore();
    }
});

test("guard: registers an error listener (otherwise Socket.IO prints a stack trace per rejected packet)", async () => {
    const socket = await authedSocket();

    assert.ok(socket.listenerCount("error") >= 1);
});

// ------------------------------------------------------------------
// socket lifetime
// ------------------------------------------------------------------

test("lifetime: socket is closed when its JWT expires", async () => {
    const socket = await authedSocket();
    const restore = quiet();

    try {
        // Re-arm with a token that dies in ~1 second.
        const shortLived = fakeSocket({ cookie: socket.handshake.headers.cookie });

        await runHandshake(socketAuth.authMiddleware, shortLived);
        shortLived.data.tokenExp = now() + 1;
        socketAuth.protectSocket(shortLived);

        assert.equal(shortLived.connected, true);

        await sleep(1300);

        assert.equal(shortLived.connected, false);
        assert.deepEqual(shortLived.eventsNamed("auth:expired"), [{ reason: "token_expired" }]);
    } finally {
        restore();
    }
});

test("lifetime: the expiry timer is cancelled when the client disconnects first", async () => {
    const socket = await authedSocket();

    socket.data.tokenExp = now() + 1;
    const early = fakeSocket({ cookie: socket.handshake.headers.cookie });
    await runHandshake(socketAuth.authMiddleware, early);
    early.data.tokenExp = now() + 1;
    socketAuth.protectSocket(early);

    early.disconnect();
    await sleep(1300);

    assert.deepEqual(early.eventsNamed("auth:expired"), []);
});

// ------------------------------------------------------------------
// logout closes live sockets
// ------------------------------------------------------------------

test("logout: closes every live socket using that session, leaves others alone", async () => {
    const tabA = await authedSocket({ id: "tab-a" });
    const tabB = fakeSocket({ id: "tab-b", cookie: tabA.handshake.headers.cookie });   // same session, 2nd tab
    await runHandshake(socketAuth.authMiddleware, tabB);
    socketAuth.protectSocket(tabB);

    const otherSession = fakeSocket({ id: "other", cookie: await (async () => {
        const res = await runChain([controller.login], mockReq({ body: { email: "jeevith@example.com", password: "password123" } }), mockRes());
        return authCookieFrom(res);
    })() });
    await runHandshake(socketAuth.authMiddleware, otherSession);
    socketAuth.protectSocket(otherSession);

    const io = { sockets: { sockets: new Map([["tab-a", tabA], ["tab-b", tabB], ["other", otherSession]]) } };
    const detach = socketAuth.attachLogoutHandler(io);
    const restore = quiet();

    try {
        await runChain([controller.logout], mockReq({ headers: { cookie: tabA.handshake.headers.cookie } }), mockRes());

        assert.equal(tabA.connected, false);
        assert.equal(tabB.connected, false);
        assert.deepEqual(tabA.eventsNamed("auth:expired"), [{ reason: "logout" }]);
        assert.equal(otherSession.connected, true);
    } finally {
        restore();
        detach();
    }
});

test("logout handler: detach function really removes the listener", async () => {
    const socket = await authedSocket({ id: "s" });
    const io = { sockets: { sockets: new Map([["s", socket]]) } };

    const before = authEvents.listenerCount("logout");
    const detach = socketAuth.attachLogoutHandler(io);

    assert.equal(authEvents.listenerCount("logout"), before + 1);

    detach();

    assert.equal(authEvents.listenerCount("logout"), before);
});

// ------------------------------------------------------------------
// origin check (cross-site WebSocket hijacking)
// ------------------------------------------------------------------

function origin(headers) {
    return new Promise((resolve) =>
        socketAuth.allowRequest({ headers }, (error, ok) => resolve({ error, ok }))
    );
}

test("allowRequest: allowed frontend origins pass", async () => {
    for (const value of ["http://localhost:5173", "http://127.0.0.1:5173"]) {
        assert.deepEqual(await origin({ origin: value }), { error: null, ok: true });
    }
});

test("allowRequest: browsers on any other origin are refused", async () => {
    const restore = quiet();

    try {
        for (const value of ["https://evil.example", "http://localhost:5174", "null"]) {
            const result = await origin({ origin: value });

            assert.equal(result.ok, false, value);
            assert.ok(result.error);
        }
    } finally {
        restore();
    }
});

test("allowRequest: non-browser clients without Origin are allowed (they still need a valid cookie)", async () => {
    assert.deepEqual(await origin({}), { error: null, ok: true });
});
