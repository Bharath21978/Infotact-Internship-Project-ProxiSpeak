"use strict";

// AUTH_ENABLED=false  (legacy / local-debug mode). Separate file because
// config is read once per process.

process.env.AUTH_ENABLED = "false";

const { TEST_JWT_SECRET } = require("../helpers/env");

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { createFakeDb } = require("../helpers/fakeDb");
const { mockReq, mockRes, runChain, authCookieFrom, fakeSocket, sendPacket, runHandshake } = require("../helpers/mocks");

const db = createFakeDb();
require("../../config/db").setPool(db.pool);

const config = require("../../config");
const controller = require("../../controllers/auth.controller");
const { COOKIE_NAME } = require("../../utils/token");
const socketAuth = require("../../sockets/socketAuth");

test("config reports auth disabled", () => {
    assert.equal(config.authEnabled, false);
    assert.ok(TEST_JWT_SECRET);
});

test("anonymous socket is accepted and can send every existing event (old behaviour preserved)", async () => {
    const socket = fakeSocket();

    assert.equal(await runHandshake(socketAuth.authMiddleware, socket), null);
    socketAuth.protectSocket(socket);

    assert.equal(socket.data.user, undefined);

    for (const event of ["player:join", "player:move", "player:leave", "rtc:offer", "rtc:answer", "rtc:ice-candidate"]) {
        assert.equal((await sendPacket(socket, event)).delivered, true, event);
    }
});

test("a garbage cookie does not block an anonymous socket", async () => {
    const socket = fakeSocket({ cookie: `${COOKIE_NAME}=garbage` });

    assert.equal(await runHandshake(socketAuth.authMiddleware, socket), null);
    assert.equal(socket.data.user, undefined);
});

test("a valid cookie is still recognised, and expiry is still enforced for identified sockets", async () => {
    await runChain([controller.register], mockReq({ body: { username: "jeevith", email: "jeevith@example.com", password: "password123" } }), mockRes());
    const login = await runChain([controller.login], mockReq({ body: { email: "jeevith@example.com", password: "password123" } }), mockRes());

    const socket = fakeSocket({ cookie: authCookieFrom(login) });

    assert.equal(await runHandshake(socketAuth.authMiddleware, socket), null);
    socketAuth.protectSocket(socket);

    assert.equal(socket.data.userId, 1);
    assert.equal((await sendPacket(socket, "player:move")).delivered, true);

    socket.data.tokenExp = Math.floor(Date.now() / 1000) - 1;

    const restore = { log: console.log };
    console.log = () => {};

    try {
        assert.equal((await sendPacket(socket, "player:move")).delivered, false);
    } finally {
        console.log = restore.log;
    }
});

test("database outage does not block anonymous sockets in legacy mode", async () => {
    const { connectionRefused } = require("../helpers/fakeDb");

    db.fail(connectionRefused());

    const restoreErr = console.error;
    console.error = () => {};

    try {
        const socket = fakeSocket({ cookie: `${COOKIE_NAME}=whatever` });

        assert.equal(await runHandshake(socketAuth.authMiddleware, socket), null);
    } finally {
        console.error = restoreErr;
    }
});
