"use strict";

// --------------------------------------------------
// SOCKET.IO AUTHENTICATION
//
// Layers:
//   1. allowRequest   - rejects browsers on a foreign Origin before the
//                       WebSocket/polling session even starts
//                       (prevents cross-site WebSocket hijacking).
//   2. handshake auth - reads the HTTP-only cookie from the handshake,
//                       verifies the JWT, checks it was not revoked,
//                       loads the user, and stores the identity on
//                       socket.data. Rejects when auth is enabled.
//   3. packet guard   - re-checks identity and token expiry on EVERY
//                       incoming event (player:*, rtc:*), so no event
//                       can run for an unauthenticated or expired socket.
//   4. lifetime       - a socket never outlives its token: it is closed
//                       when the JWT expires or the user logs out.
//
// The existing ProxiSpeak event names and payloads are not touched.
// The only addition is one server -> client event:
//   "auth:expired"  { reason: "logout" | "token_expired" }
// sent just before the server closes the connection.
// --------------------------------------------------

const config = require("../config");
const authEvents = require("../utils/events");
const { resolveSession } = require("../utils/session");

const MAX_TIMER_MS = 2 ** 31 - 1;

const allowedOrigins = new Set(config.allowedOrigins);

function authError(message, code) {
    const error = new Error(message);
    error.data = { code };
    return error;
}

// ---------- 1. origin check (engine level) ----------

// Browsers always send Origin on WebSocket handshakes. Non-browser
// clients (tests, Postman) usually send none and cannot carry a
// victim's cookies, so a missing Origin is allowed.
function allowRequest(req, callback) {
    const origin = req.headers.origin;

    if (origin && !allowedOrigins.has(origin)) {
        console.log("Rejected socket handshake from origin:", origin);
        return callback("Origin not allowed", false);
    }

    callback(null, true);
}

// ---------- 2. handshake authentication (io.use) ----------

async function authMiddleware(socket, next) {
    try {
        const session = await resolveSession(socket.handshake.headers.cookie);

        if (session.ok) {
            socket.data.user = session.user;
            socket.data.userId = session.user.id;
            socket.data.jti = session.jti;
            socket.data.tokenExp = session.exp;
            return next();
        }

        if (!config.authEnabled) {
            // Legacy / dev mode: anonymous sockets are allowed.
            return next();
        }

        console.log(`Rejected unauthenticated socket (${session.code})`);
        return next(authError("Authentication required", session.code));
    } catch (error) {
        // Database unavailable etc. Fail closed when auth is enforced.
        console.error(
            "Socket auth failed:",
            error?.code || error?.name || "UNKNOWN"
        );

        if (!config.authEnabled) return next();

        return next(authError("Service unavailable", "SERVICE_UNAVAILABLE"));
    }
}

// ---------- 3 + 4. per-socket protection ----------

function expireSocket(socket, reason) {
    if (!socket.connected) return;

    console.log(`Closing socket ${socket.id}: ${reason}`);

    socket.emit("auth:expired", { reason });
    socket.disconnect(true);
}

// Register as: io.on("connection", protectSocket) BEFORE the handlers
// that implement player/rtc events.
function protectSocket(socket) {
    // Required: without an "error" listener Socket.IO prints a stack
    // trace for every rejected packet.
    socket.on("error", (error) => {
        console.log(`Socket ${socket.id} packet rejected: ${error?.message}`);
    });

    // Runs before every event handler registered on this socket.
    socket.use((packet, next) => {
        if (!socket.data.user) {
            // Only reachable when authEnabled is false (anonymous mode)
            // or if identity was somehow cleared: enforce when enabled.
            if (!config.authEnabled) return next();

            socket.disconnect(true);
            return next(authError("Authentication required", "AUTH_REQUIRED"));
        }

        if (socket.data.tokenExp * 1000 <= Date.now()) {
            expireSocket(socket, "token_expired");
            return next(authError("Session expired", "TOKEN_EXPIRED"));
        }

        next();
    });

    // Close the socket when its token expires.
    if (socket.data.user) {
        const remainingMs = socket.data.tokenExp * 1000 - Date.now();

        // setTimeout cannot exceed ~24.8 days; JWT_EXPIRES_IN is capped
        // at 7 days, and the packet guard above covers any drift anyway.
        const timer = setTimeout(
            () => expireSocket(socket, "token_expired"),
            Math.min(Math.max(remainingMs, 0), MAX_TIMER_MS)
        );

        timer.unref();

        socket.once("disconnect", () => clearTimeout(timer));
    }
}

// ---------- logout -> close live sockets ----------

function attachLogoutHandler(io) {
    const handler = ({ jti }) => {
        for (const socket of io.sockets.sockets.values()) {
            if (socket.data.jti === jti) {
                expireSocket(socket, "logout");
            }
        }
    };

    authEvents.on("logout", handler);

    return () => authEvents.off("logout", handler);
}

module.exports = {
    allowRequest,
    authMiddleware,
    protectSocket,
    attachLogoutHandler
};
