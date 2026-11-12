"use strict";

const { AppError } = require("../utils/errors");
const { resolveSession } = require("../utils/session");
const { clearAuthCookie } = require("../utils/token");

// Protects a route: reads the auth cookie, verifies the JWT, checks the
// token was not revoked by logout, loads the user from MySQL.
//
// On success: req.user = { id, username, email }, req.auth = { jti, exp }
// On failure: 401 (and a stale/bad cookie is cleared)
// Database problems propagate to the error handler (-> 503).
async function requireAuth(req, res, next) {
    const session = await resolveSession(req.headers.cookie);

    if (!session.ok) {
        if (session.hadToken) {
            clearAuthCookie(res);
        }

        throw new AppError(401, session.code, session.message);
    }

    req.user = session.user;
    req.auth = { jti: session.jti, exp: session.exp };

    next();
}

module.exports = { requireAuth };
