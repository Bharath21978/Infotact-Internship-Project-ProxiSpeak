"use strict";

// --------------------------------------------------
// CSRF PROTECTION FOR COOKIE AUTHENTICATION
//
// Layers (defence in depth):
//   1. Auth cookie is SameSite=Lax (or Strict): browsers do not attach
//      it to cross-site POSTs.
//   2. This guard rejects state-changing requests whose Origin header is
//      present but not on the allow-list. Browsers always send Origin on
//      cross-origin POSTs, so a hostile page cannot forge one.
//   3. Requests flagged by the browser as cross-site (Sec-Fetch-Site)
//      without an Origin header are rejected too.
//   4. Only JSON bodies are parsed, and CORS only allows our frontend,
//      so "simple" cross-site form posts carry no usable payload.
//
// Requests with no Origin at all (Postman, curl, server-to-server) are
// allowed: they are not browser requests and cannot ride a victim's
// cookies.
// --------------------------------------------------

const { AppError } = require("../utils/errors");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originGuard(allowedOrigins) {
    const allowed = new Set(allowedOrigins);

    return function originGuardMiddleware(req, res, next) {
        if (SAFE_METHODS.has(req.method)) return next();

        const origin = req.headers.origin;

        if (origin !== undefined) {
            if (!allowed.has(origin)) {
                return next(
                    new AppError(403, "ORIGIN_NOT_ALLOWED", "Origin not allowed.")
                );
            }

            return next();
        }

        if (req.headers["sec-fetch-site"] === "cross-site") {
            return next(
                new AppError(403, "ORIGIN_NOT_ALLOWED", "Origin not allowed.")
            );
        }

        next();
    };
}

module.exports = { originGuard };
