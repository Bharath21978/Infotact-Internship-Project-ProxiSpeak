"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const config = require("../config");
const User = require("../models/user.model");
const RevokedToken = require("../models/revokedToken.model");
const authEvents = require("../utils/events");
const { AppError, isDuplicateEntryError } = require("../utils/errors");
const { validateRegister, validateLogin } = require("../utils/validation");
const {
    signAuthToken,
    verifyAuthToken,
    setAuthCookie,
    clearAuthCookie,
    getTokenFromCookieHeader
} = require("../utils/token");

const EMAIL_TAKEN = () =>
    new AppError(
        409,
        "EMAIL_ALREADY_REGISTERED",
        "An account with this email already exists.",
        { email: "An account with this email already exists" }
    );

// A real bcrypt hash of a random value, computed once. Login compares
// against it when the email is unknown so "no such user" and "wrong
// password" take the same time (prevents account enumeration by timing).
let dummyHashPromise = null;

function getDummyHash() {
    if (!dummyHashPromise) {
        dummyHashPromise = bcrypt.hash(
            crypto.randomBytes(24).toString("hex"),
            config.bcryptRounds
        );
    }

    return dummyHashPromise;
}

// POST /api/auth/register
async function register(req, res) {
    const { value, errors } = validateRegister(req.body);

    if (Object.keys(errors).length > 0) {
        throw new AppError(
            400,
            "VALIDATION_ERROR",
            "Please correct the highlighted fields.",
            errors
        );
    }

    const { username, email, password } = value;

    if (await User.emailExists(email)) {
        throw EMAIL_TAKEN();
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

    let user;

    try {
        user = await User.create({ username, email, passwordHash });
    } catch (error) {
        // Two simultaneous registrations can both pass the check above;
        // the UNIQUE index on users.email is the real guarantee.
        if (isDuplicateEntryError(error)) {
            throw EMAIL_TAKEN();
        }

        throw error;
    }

    res.status(201).json({
        success: true,
        message: "Registration successful.",
        user: User.toPublicUser(user)
    });
}

// POST /api/auth/login
async function login(req, res) {
    const { value, errors } = validateLogin(req.body);

    if (Object.keys(errors).length > 0) {
        throw new AppError(
            400,
            "VALIDATION_ERROR",
            "Please correct the highlighted fields.",
            errors
        );
    }

    const { email, password } = value;

    const row = await User.findByEmail(email);

    const matches = await bcrypt.compare(
        password,
        row ? row.password_hash : await getDummyHash()
    );

    // One generic message for both cases: never reveal which part failed.
    if (!row || !matches) {
        throw new AppError(
            401,
            "INVALID_CREDENTIALS",
            "Invalid email or password."
        );
    }

    const { token } = signAuthToken(row);

    setAuthCookie(res, token);

    res.status(200).json({
        success: true,
        message: "Login successful.",
        user: User.toPublicUser(row)
    });
}

// GET /api/auth/me   (behind requireAuth)
function me(req, res) {
    res.status(200).json({
        success: true,
        user: req.user
    });
}

// POST /api/auth/logout
//
// Idempotent: always clears the cookie and answers 200, so a frontend
// whose session already expired can still "log out" cleanly. If the
// cookie holds a currently valid token it is revoked server-side and any
// live Socket.IO connections using it are closed.
async function logout(req, res) {
    // Clear first: even if the revocation write below fails, the browser
    // forgets the cookie.
    clearAuthCookie(res);

    const token = getTokenFromCookieHeader(req.headers.cookie);
    const verified = token ? verifyAuthToken(token) : { ok: false };

    if (verified.ok) {
        // Drop live sockets immediately, regardless of the DB outcome.
        authEvents.emit("logout", {
            jti: verified.jti,
            userId: verified.userId
        });

        await RevokedToken.revoke({
            jti: verified.jti,
            userId: verified.userId,
            expiresAt: verified.exp
        });

        // Housekeeping: rows for tokens that have expired anyway are
        // useless. A failure here must never fail the logout.
        RevokedToken.purgeExpired(Math.floor(Date.now() / 1000)).catch(
            () => {}
        );
    }

    res.status(200).json({
        success: true,
        message: "Logged out successfully."
    });
}

module.exports = { register, login, me, logout };
