"use strict";

// Characterisation tests for the ORIGINAL ProxiSpeak multiplayer
// behaviour (join / move / leave / disconnect / room isolation / WebRTC
// relay), derived by reading the original server.js. They are shared by:
//   - socket.legacy.integration.test.js  (auth disabled, or the ORIGINAL
//                                         unmodified server via TARGET_URL)
//   - socket.auth.integration.test.js    (same behaviour must hold after
//                                         authenticating)
// Room ids are arbitrary strings to the server; these are just labels.

const assert = require("node:assert/strict");
const { afterEach } = require("node:test");

let counter = 0;

function defineMultiplayerTests(test, connectClient) {
    const open = [];

    async function client() {
        const result = await connectClient();

        assert.equal(result.connected, true, `connect failed: ${JSON.stringify(result)}`);
        open.push(result.client);

        return result.client;
    }

    const room = () => `room-${++counter}`;
    const player = (id, x = 100, y = 100) => ({ id, name: id, role: "Participant", color: "#8eaaff", x, y });
    const join = (c, roomId, p) => c.emit("player:join", { roomId, player: p });
    const has = (id) => (list) => Array.isArray(list) && list.some((p) => p.id === id);

    afterEach(() => { while (open.length) open.pop().close(); });

    test("join: players in the same room see each other (players:update)", async () => {
        const [a, b, roomId] = [await client(), await client(), room()];

        join(a, roomId, player("a"));
        assert.deepEqual(await a.waitFor("players:update", (l) => l.length === 0), []);

        join(b, roomId, player("b", 300, 200));

        const seenByA = await a.waitFor("players:update", has("b"));
        const seenByB = await b.waitFor("players:update", has("a"));

        assert.deepEqual(seenByA.find((p) => p.id === "b"), { id: "b", name: "b", role: "Participant", color: "#8eaaff", x: 300, y: 200 });
        assert.equal(seenByB.length, 1);
    });

    test("move: position updates reach the other player", async () => {
        const [a, b, roomId] = [await client(), await client(), room()];

        join(a, roomId, player("a")); join(b, roomId, player("b"));
        await a.waitFor("players:update", has("b"));
        a.clear();

        b.emit("player:move", { roomId, x: 640, y: 360 });

        const update = await a.waitFor("players:update", (l) => l.some((p) => p.id === "b" && p.x === 640 && p.y === 360));
        assert.ok(update);
    });

    test("invalid join / invalid or foreign-room movement is ignored", async () => {
        const [a, b, c, roomId] = [await client(), await client(), await client(), room()];

        join(a, roomId, player("a")); join(b, roomId, player("b"));
        await a.waitFor("players:update", has("b"));
        a.clear();

        join(c, roomId, player("c", -5, 0));                         // out of bounds
        c.emit("player:join", { roomId: "", player: player("c") });  // empty room
        b.emit("player:move", { roomId, x: 99999, y: 0 });           // out of range
        b.emit("player:move", { roomId: "some-other-room", x: 1, y: 1 });

        assert.equal(await a.expectNone("players:update"), true);
    });

    test("rooms are isolated", async () => {
        const [a, d] = [await client(), await client()];

        join(a, room(), player("a")); join(d, room(), player("d"));

        await new Promise((r) => setTimeout(r, 300));

        assert.equal(await a.expectNone("players:update", has("d"), 100), true);
        assert.equal(await d.expectNone("players:update", has("a"), 100), true);
    });

    test("leave: leaver gets [], the other player no longer sees them", async () => {
        const [a, b, roomId] = [await client(), await client(), room()];

        join(a, roomId, player("a")); join(b, roomId, player("b"));
        await a.waitFor("players:update", has("b"));
        a.clear(); b.clear();

        b.emit("player:leave");

        assert.deepEqual(await b.waitFor("players:update", (l) => l.length === 0), []);
        assert.deepEqual(await a.waitFor("players:update", (l) => l.length === 0), []);
    });

    test("disconnect: remaining players are told the player is gone", async () => {
        const [a, b, roomId] = [await client(), await client(), room()];

        join(a, roomId, player("a")); join(b, roomId, player("b"));
        await a.waitFor("players:update", has("b"));
        a.clear();

        b.close();

        assert.deepEqual(await a.waitFor("players:update", (l) => l.length === 0), []);
    });

    test("switching rooms removes the player from the old room", async () => {
        const [a, b, r1, r2] = [await client(), await client(), room(), room()];

        join(a, r1, player("a")); join(b, r1, player("b"));
        await a.waitFor("players:update", has("b"));
        a.clear();

        join(b, r2, player("b"));

        assert.deepEqual(await a.waitFor("players:update", (l) => l.length === 0), []);
    });

    test("WebRTC: offer, answer and ICE candidate are relayed with { from, roomId, ... }", async () => {
        const [a, b, roomId] = [await client(), await client(), room()];

        join(a, roomId, player("a")); join(b, roomId, player("b"));
        await a.waitFor("players:update", has("b"));

        const offer = { type: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n" };
        const answer = { type: "answer", sdp: "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n" };
        const candidate = { candidate: "candidate:1 1 udp 2122260223 192.168.1.5 54400 typ host", sdpMid: "0", sdpMLineIndex: 0 };

        a.emit("rtc:offer", { roomId, to: b.id, description: offer });
        assert.deepEqual(await b.waitFor("rtc:offer"), { from: a.id, roomId, description: offer });

        b.emit("rtc:answer", { roomId, to: a.id, description: answer });
        assert.deepEqual(await a.waitFor("rtc:answer"), { from: b.id, roomId, description: answer });

        a.emit("rtc:ice-candidate", { roomId, to: b.id, candidate });
        assert.deepEqual(await b.waitFor("rtc:ice-candidate"), { from: a.id, roomId, candidate });
    });

    test("WebRTC: signaling to another room, to yourself, with a wrong room or a bad payload is dropped", async () => {
        const [a, b, outsider, roomId] = [await client(), await client(), await client(), room()];

        join(a, roomId, player("a")); join(b, roomId, player("b")); join(outsider, room(), player("o"));
        await a.waitFor("players:update", has("b"));

        const description = { type: "offer", sdp: "v=0\r\n" };

        a.emit("rtc:offer", { roomId, to: outsider.id, description });          // target in another room
        a.emit("rtc:offer", { roomId, to: a.id, description });                  // self
        a.emit("rtc:offer", { roomId: "not-my-room", to: b.id, description });   // wrong room
        a.emit("rtc:offer", { roomId, to: b.id, description: { type: "answer", sdp: "v=0" } });  // wrong type
        a.emit("rtc:ice-candidate", { roomId, to: b.id, candidate: "nope" });    // bad candidate

        assert.equal(await outsider.expectNone("rtc:offer"), true);
        assert.equal(await a.expectNone("rtc:offer", () => true, 50), true);
        assert.equal(await b.expectNone("rtc:offer"), true);
        assert.equal(await b.expectNone("rtc:ice-candidate", () => true, 50), true);
    });
}

module.exports = { defineMultiplayerTests };
