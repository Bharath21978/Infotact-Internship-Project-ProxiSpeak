"use strict";

// Needs `npm ci` first (not executed in the authoring sandbox).

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { startServer } = require("../helpers/server");
const { request, cookieFrom } = require("../helpers/httpClient");
const { connect } = require("../helpers/sioClient");

const FRONTEND = "http://localhost:5173";
let s;
let cookie;

async function loginAs(username) {
    const email = `${username}@example.com`;

    await request(s.baseUrl, "/api/auth/register", { method: "POST", origin: FRONTEND, body: { username, email, password: "password123" } });

    const res = await request(s.baseUrl, "/api/auth/login", { method: "POST", origin: FRONTEND, body: { email, password: "password123" } });

    return cookieFrom(res);
}

before(async () => {
    s = await startServer({ AUTH_ENABLED: "true", JWT_EXPIRES_IN: "1h" });
    cookie = await loginAs("jeevith");
});

after(async () => { await s.close(); });

const authed = () => connect({ url: s.baseUrl, cookie, origin: FRONTEND });

test("handshake: valid cookie connects and the user id is bound to the socket", async () => {
    const r = await authed();

    assert.equal(r.connected, true);
    assert.equal(s.io.sockets.sockets.get(r.client.id).data.userId, 1);

    r.client.close();
});

test("handshake: no cookie, garbage cookie, forged token, wrong origin -> refused", async () => {
    const none = await connect({ url: s.baseUrl, origin: FRONTEND });
    assert.equal(none.connected, false);
    assert.equal(none.reason, "connect_error");
    assert.equal(none.data.code, "AUTH_REQUIRED");

    const junk = await connect({ url: s.baseUrl, origin: FRONTEND, cookie: "proxispeak_token=garbage" });
    assert.equal(junk.connected, false);

    const forged = jwt.sign({}, "wrong-secret-0123456789-abcdefghijklmnopqrstuv", {
        algorithm: "HS256", issuer: "proxispeak", audience: "proxispeak-web", subject: "1", jwtid: "f", expiresIn: 3600
    });
    assert.equal((await connect({ url: s.baseUrl, origin: FRONTEND, cookie: `proxispeak_token=${forged}` })).connected, false);

    // valid cookie but from a hostile website
    const hijack = await connect({ url: s.baseUrl, origin: "https://evil.example", cookie });
    assert.equal(hijack.connected, false);
    assert.equal(hijack.status, 403);
});

test("unauthenticated users cannot reach rooms: nothing they send is ever processed", async () => {
    const watcher = await authed();
    const roomId = "protected-room";

    watcher.client.emit("player:join", { roomId, player: { id: "w", name: "w", x: 1, y: 1 } });
    await watcher.client.waitFor("players:update");
    watcher.client.clear();

    const anon = await connect({ url: s.baseUrl, origin: FRONTEND });

    assert.equal(anon.connected, false);                      // cannot even join the namespace
    assert.equal(await watcher.client.expectNone("players:update"), true);

    watcher.client.close();
});

test("defence in depth: a socket that loses its identity cannot join rooms or signal", async () => {
    const a = (await authed()).client;
    const b = (await authed()).client;

    a.emit("player:join", { roomId: "dd", player: { id: "a", name: "a", x: 1, y: 1 } });
    b.emit("player:join", { roomId: "dd", player: { id: "b", name: "b", x: 1, y: 1 } });
    await a.waitFor("players:update", (l) => l.length === 1);
    a.clear(); b.clear();

    s.io.sockets.sockets.get(a.id).data.user = null;          // simulate lost identity

    a.emit("rtc:offer", { roomId: "dd", to: b.id, description: { type: "offer", sdp: "v=0\r\n" } });

    assert.equal(await b.expectNone("rtc:offer"), true);
    assert.equal(await a.waitForClose(), true);                // and the server hangs up

    b.close();
});

test("logout closes the user's live sockets and the cookie stops working", async () => {
    const mine = await loginAs("logoutuser");
    const r = await connect({ url: s.baseUrl, origin: FRONTEND, cookie: mine });

    assert.equal(r.connected, true);

    const out = await request(s.baseUrl, "/api/auth/logout", { method: "POST", origin: FRONTEND, cookie: mine });

    assert.equal(out.status, 200);
    assert.equal(await r.client.waitForClose(), true);
    assert.deepEqual(r.client.received.find((e) => e.event === "auth:expired")?.data, { reason: "logout" });

    assert.equal((await connect({ url: s.baseUrl, origin: FRONTEND, cookie: mine })).connected, false);
});

test("a socket is closed when its JWT expires", async () => {
    const now = Math.floor(Date.now() / 1000);
    const short = jwt.sign({ sub: "1", jti: "short-lived", exp: now + 2, iat: now }, s.secret, {
        algorithm: "HS256", issuer: "proxispeak", audience: "proxispeak-web"
    });

    const r = await connect({ url: s.baseUrl, origin: FRONTEND, cookie: `proxispeak_token=${short}` });

    assert.equal(r.connected, true);
    assert.equal(await r.client.waitForClose(4000), true);
    assert.deepEqual(r.client.received.find((e) => e.event === "auth:expired")?.data, { reason: "token_expired" });
});

// ---------------------------------------------------------------
// Trusted identity: the server, not the client, decides who a player is.
// (The shared legacy scenarios, which pick their own ids, run in
// socket.legacy.integration.test.js with AUTH_ENABLED=false. Here every
// client logs in as a different user.)
// ---------------------------------------------------------------

let userCounter = 0;

async function newUser() {
    const name = `player${++userCounter}`;
    const userCookie = await loginAs(name);
    const r = await connect({ url: s.baseUrl, origin: FRONTEND, cookie: userCookie });

    assert.equal(r.connected, true);

    return { client: r.client, name };
}

const idOf = (client) => String(s.io.sockets.sockets.get(client.id).data.userId);

test("join: client-supplied id, name and role are ignored; server values are used", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const roomId = "identity-room";

    a.client.emit("player:join", { roomId, player: { id: "a", name: "a", x: 10, y: 10 } });
    b.client.emit("player:join", {
        roomId,
        player: { id: idOf(a.client), name: "Admin", role: "Moderator", color: "#112233", x: 300, y: 200 }
    });

    const seen = await a.client.waitFor("players:update", (l) => l.length === 1);

    assert.deepEqual(seen[0], {
        id: idOf(b.client),          // from the JWT, not the payload
        name: b.name,                // from MySQL, not the payload
        role: "Participant",
        color: "#112233",
        x: 300,
        y: 200
    });
    assert.notEqual(seen[0].id, idOf(a.client));   // cannot impersonate user a

    a.client.close(); b.client.close();
});

test("multiple users: movement is synchronised and disconnect removes the right player", async () => {
    const [a, b, c] = [await newUser(), await newUser(), await newUser()];
    const roomId = "sync-room";

    for (const u of [a, b, c]) u.client.emit("player:join", { roomId, player: { id: "x", x: 5, y: 5 } });

    await a.client.waitFor("players:update", (l) => l.length === 2);
    a.client.clear();

    b.client.emit("player:move", { roomId, x: 640, y: 360 });

    const moved = await a.client.waitFor("players:update", (l) => l.some((p) => p.id === idOf(b.client) && p.x === 640 && p.y === 360));
    assert.ok(moved);

    b.client.close();

    const after = await a.client.waitFor("players:update", (l) => l.length === 1);
    assert.equal(after[0].id, idOf(c.client));

    a.client.close(); c.client.close();
});

test("signalling: relayed with the server-side socket id, never a client-supplied sender", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const roomId = "rtc-room";

    a.client.emit("player:join", { roomId, player: { id: "a", x: 1, y: 1 } });
    b.client.emit("player:join", { roomId, player: { id: "b", x: 1, y: 1 } });
    await a.client.waitFor("players:update", (l) => l.length === 1);
    b.client.clear();

    a.client.emit("rtc:offer", { roomId, to: b.client.id, from: "spoofed", description: { type: "offer", sdp: "v=0\r\n" } });

    const offer = await b.client.waitFor("rtc:offer");
    assert.equal(offer.from, a.client.id);
    assert.equal(offer.roomId, roomId);

    a.client.close(); b.client.close();
});
