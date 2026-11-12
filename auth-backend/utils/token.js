"use strict";

// --------------------------------------------------
// JWT + AUTH COOKIE HELPERS
//
// Strategy: stateless signed JWT (HS256) stored ONLY in an HTTP-only
// cookie (never returned in a response body, so frontend JavaScript
// cannot read it). Each token has a unique id (jti); logout records
// that id in the revoked_tokens table so the token stops working
// immediately, even though its signature is still valid.
// --------------------------------------------------

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const config = require("../config");

const COOKIE_NAME = config.cookie.name;

// ---------------- JWT ----------------

// Returns { token, jti, exp } where exp is a Unix timestamp (seconds).
function signAuthToken(user) {
    const jti = crypto.randomUUID();

    const token = jwt.sign({}, config.jwt.secret, {
        algorithm: config.jwt.algorithm,
        subject: String(user.id),
        jwtid: jti,
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
        expiresIn: config.jwt.expiresInSeconds
    });

    const { exp } = jwt.decode(token);

    return { token, jti, exp };
}

const INVALID = Object.freeze({
    ok: false,
    code: "TOKEN_INVALID",
    message: "Invalid authentication token."
});

const EXPIRED = Object.freeze({
    ok: false,
    code: "TOKEN_EXPIRED",
    message: "Session expired. Please log in again."
});

// Never throws. Returns { ok: true, userId, jti, exp } or
// { ok: false, code, message }.
function verifyAuthToken(token) {
    let payload;

    try {
        payload = jwt.verify(token, config.jwt.secret, {
            // Pin the algorithm so "alg: none" / algorithm-swap tokens fail.
            algorithms: [config.jwt.algorithm],
            issuer: config.jwt.issuer,
            audience: config.jwt.audience
        });
    } catch (error) {
        return error?.name === "TokenExpiredError" ? EXPIRED : INVALID;
    }

    if (
        typeof payload?.sub !== "string" ||
        !/^\d+$/.test(payload.sub) ||
        typeof payload.jti !== "string" ||
        payload.jti.length === 0 ||
        !Number.isInteger(payload.exp)
    ) {
        return INVALID;
    }

    return {
        ok: true,
        userId: Number(payload.sub),
        jti: payload.jti,
        exp: payload.exp
    };
}

// ---------------- COOKIE ----------------

function baseCookieOptions() {
    const options = {
        httpOnly: true,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
        path: "/"
    };

    if (config.cookie.domain) {
        options.domain = config.cookie.domain;
    }

    return options;
}

function setAuthCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
        ...baseCookieOptions(),
        maxAge: config.cookie.maxAgeMs
    });
}

// Must use the same name/path/domain (and attributes) as the cookie that
// was set, otherwise the browser keeps the original.
function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, baseCookieOptions());
}

// Minimal Cookie-header parser (first occurrence of a name wins).
// Used for both HTTP requests and the Socket.IO handshake, where no
// cookie-parser middleware runs.
function parseCookieHeader(header) {
    const cookies = {};

    if (typeof header !== "string" || header.length === 0) return cookies;

    for (const part of header.split(";")) {
        const index = part.indexOf("=");

        if (index < 0) continue;

        const name = part.slice(0, index).trim();

        if (!name || name in cookies) continue;

        let value = part.slice(index + 1).trim();

        if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
        }

        try {
            cookies[name] = decodeURIComponent(value);
        } catch {
            cookies[name] = value;
        }
    }

    return cookies;
}

function getTokenFromCookieHeader(header) {
    return parseCookieHeader(header)[COOKIE_NAME] || null;
}

module.exports = {
    COOKIE_NAME,
    signAuthToken,
    verifyAuthToken,
    setAuthCookie,
    clearAuthCookie,
    parseCookieHeader,
    getTokenFromCookieHeader
};
