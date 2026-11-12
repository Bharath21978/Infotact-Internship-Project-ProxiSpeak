"use strict";

// Minimal req/res doubles + an Express-5-style chain runner, so
// controllers and middleware can be exercised without Express installed.

function mockReq({
    method = "POST",
    path = "/",
    body,
    headers = {},
    ip = "127.0.0.1"
} = {}) {
    const lowered = {};

    for (const [key, value] of Object.entries(headers)) {
        lowered[key.toLowerCase()] = value;
    }

    return { method, path, body, headers: lowered, ip };
}

function mockRes() {
    const finishListeners = [];

    const res = {
        statusCode: 200,
        headers: {},
        body: undefined,
        cookies: [],
        cleared: [],
        headersSent: false,
        _onSent: null,

        status(code) { this.statusCode = code; return this; },

        set(key, value) { this.headers[key.toLowerCase()] = value; return this; },

        cookie(name, value, options) {
            this.cookies.push({ name, value, options });
            return this;
        },

        clearCookie(name, options) {
            this.cleared.push({ name, options });
            return this;
        },

        on(event, listener) {
            if (event === "finish") finishListeners.push(listener);
            return this;
        },

        json(body) {
            this.body = body;
            this.headersSent = true;
            finishListeners.forEach((listener) => listener());
            if (this._onSent) this._onSent();
            return this;
        }
    };

    return res;
}

// Runs handlers like Express 5: async rejections and next(err) both go
// to the real central error handler.
function runChain(chain, req, res) {
    const { errorHandler } = require("../../middleware/error.middleware");

    return new Promise((resolve) => {
        let index = 0;

        const fail = (error) => {
            errorHandler(error, req, res, () => {});
            resolve(res);
        };

        res._onSent = () => resolve(res);

        const next = (error) => {
            if (error) return fail(error);

            const handler = chain[index++];

            if (!handler) return resolve(res);

            try {
                const result = handler(req, res, next);

                if (result && typeof result.then === "function") {
                    result.catch(fail);
                }
            } catch (thrown) {
                fail(thrown);
            }
        };

        next();
    });
}

// "name=value" for the auth cookie set on a response, or null if the
// response did not set one.
function authCookieFrom(res) {
    const { COOKIE_NAME } = require("../../utils/token");
    const set = res.cookies.find((c) => c.name === COOKIE_NAME);

    return set ? `${COOKIE_NAME}=${set.value}` : null;
}

module.exports = { mockReq, mockRes, runChain, authCookieFrom };

// ---------------- Socket.IO doubles ----------------

// Just enough of a server-side Socket to exercise sockets/socketAuth.js.
function fakeSocket({ cookie, id = "sock-1" } = {}) {
    const listeners = {};
    const guards = [];

    const socket = {
        id,
        connected: true,
        data: {},
        handshake: { headers: cookie ? { cookie } : {} },
        emitted: [],
        guards,

        use(fn) { guards.push(fn); },

        on(event, fn) { (listeners[event] ||= []).push(fn); return this; },

        once(event, fn) {
            const wrapper = (...args) => {
                listeners[event] = listeners[event].filter((f) => f !== wrapper);
                fn(...args);
            };
            return this.on(event, wrapper);
        },

        emit(event, payload) { this.emitted.push([event, payload]); return true; },

        disconnect() {
            if (!this.connected) return this;
            this.connected = false;
            (listeners.disconnect || []).slice().forEach((fn) => fn("server namespace disconnect"));
            return this;
        },

        // Test helpers
        eventsNamed(name) { return this.emitted.filter(([n]) => n === name).map(([, p]) => p); },
        listenerCount(name) { return (listeners[name] || []).length; }
    };

    return socket;
}

// Pushes an incoming packet through the socket.use() guards, like
// Socket.IO does before invoking an event handler.
function sendPacket(socket, event, payload = {}) {
    return new Promise((resolve) => {
        let index = 0;

        const next = (error) => {
            if (error) return resolve({ delivered: false, error });

            const guard = socket.guards[index++];

            if (!guard) return resolve({ delivered: true, error: null });

            guard([event, payload], next);
        };

        next();
    });
}

function runHandshake(authMiddleware, socket) {
    return new Promise((resolve) => authMiddleware(socket, (error) => resolve(error || null)));
}

module.exports.fakeSocket = fakeSocket;
module.exports.sendPacket = sendPacket;
module.exports.runHandshake = runHandshake;
