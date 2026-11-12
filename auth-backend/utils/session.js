"use strict";

// --------------------------------------------------
// SESSION RESOLUTION
//
// One function used by BOTH the Express auth middleware and the
// Socket.IO handshake, so HTTP and WebSocket authentication can never
// drift apart:
//
//   cookie header -> JWT signature/expiry -> not revoked -> user exists
//
// Returns { ok: true, user, jti, exp }
//      or { ok: false, code, message, hadToken }
// Database failures are NOT caught here; they propagate to the caller.
// --------------------------------------------------

const User = require("../models/user.model");
const RevokedToken = require("../models/revokedToken.model");
const { verifyAuthToken, getTokenFromCookieHeader } = require("./token");

async function resolveSession(cookieHeader) {
    const token = getTokenFromCookieHeader(cookieHeader);

    if (!token) {
        return {
            ok: false,
            hadToken: false,
            code: "AUTH_REQUIRED",
            message: "Authentication required."
        };
    }

    const verified = verifyAuthToken(token);

    if (!verified.ok) {
        return { ...verified, hadToken: true };
    }

    if (await RevokedToken.isRevoked(verified.jti)) {
        return {
            ok: false,
            hadToken: true,
            code: "TOKEN_REVOKED",
            message: "Session has ended. Please log in again."
        };
    }

    const row = await User.findById(verified.userId);

    if (!row) {
        // Valid signature but the account no longer exists.
        return {
            ok: false,
            hadToken: true,
            code: "TOKEN_INVALID",
            message: "Invalid authentication token."
        };
    }

    return {
        ok: true,
        user: User.toPublicUser(row),
        jti: verified.jti,
        exp: verified.exp
    };
}

module.exports = { resolveSession };
