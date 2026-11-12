"use strict";

// Minimal Socket.IO (protocol v5 / Engine.IO v4) client over `ws`.
//
// Used instead of socket.io-client because it can send arbitrary Cookie
// and Origin headers on the handshake, which is exactly what is under
// test. Only what the tests need is implemented: connect, emit, receive.

const WebSocket = require("ws");

function connect({ url, cookie, origin, timeoutMs = 4000 }) {
    return new Promise((resolve) => {
        const headers = {};

        if (cookie) headers.Cookie = cookie;
        if (origin) headers.Origin = origin;

        const ws = new WebSocket(
            `${url.replace(/^http/, "ws")}/socket.io/?EIO=4&transport=websocket`,
            { headers }
        );

        const received = [];
        const waiters = [];
        let settled = false;

        const client = {
            id: null,
            closed: false,
            received,

            emit(event, data) { ws.send(`42${JSON.stringify([event, data])}`); },

            close() { ws.close(); },

            clear() { received.length = 0; },

            // Resolves with the payload of the first (past or future) event that matches.
            waitFor(event, predicate = () => true, ms = 2000) {
                const hit = received.find((e) => e.event === event && predicate(e.data));

                if (hit) return Promise.resolve(hit.data);

                return new Promise((res, rej) => {
                    const timer = setTimeout(() => rej(new Error(`timeout waiting for "${event}"`)), ms);

                    waiters.push({ event, predicate, done: (d) => { clearTimeout(timer); res(d); } });
                });
            },

            // Resolves true if NO matching event arrives within `ms`.
            async expectNone(event, predicate = () => true, ms = 300) {
                await new Promise((r) => setTimeout(r, ms));

                return !received.some((e) => e.event === event && predicate(e.data));
            },

            waitForClose(ms = 3000) {
                if (client.closed) return Promise.resolve(true);

                return new Promise((res) => {
                    const timer = setTimeout(() => res(false), ms);

                    ws.once("close", () => { clearTimeout(timer); res(true); });
                });
            }
        };

        const finish = (result) => {
            if (!settled) { settled = true; clearTimeout(boot); resolve(result); }
        };

        const boot = setTimeout(() => { ws.terminate(); finish({ connected: false, reason: "timeout" }); }, timeoutMs);

        ws.on("unexpected-response", (req, res) => {
            finish({ connected: false, reason: "http", status: res.statusCode });
            req.destroy();
        });

        ws.on("error", (error) => finish({ connected: false, reason: error.message }));

        ws.on("close", () => {
            client.closed = true;
            finish({ connected: false, reason: "closed" });
        });

        ws.on("message", (raw) => {
            const msg = raw.toString();

            if (msg[0] === "0") return ws.send("40");               // Engine.IO open -> connect to "/"
            if (msg === "2") return ws.send("3");                     // ping -> pong

            if (msg.startsWith("40")) {
                client.id = JSON.parse(msg.slice(2) || "{}").sid;
                return finish({ connected: true, client });
            }

            if (msg.startsWith("44")) {
                const payload = JSON.parse(msg.slice(2));

                finish({ connected: false, reason: "connect_error", message: payload.message, data: payload.data });
                return ws.close();
            }

            if (msg.startsWith("42")) {
                const [event, data] = JSON.parse(msg.slice(2));

                received.push({ event, data });

                for (let i = waiters.length - 1; i >= 0; i--) {
                    if (waiters[i].event === event && waiters[i].predicate(data)) {
                        waiters.splice(i, 1)[0].done(data);
                    }
                }
            }
        });
    });
}

module.exports = { connect };
