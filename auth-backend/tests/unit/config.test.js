"use strict";

require("../helpers/env");

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { loadConfig } = require("../../config/env");

const GOOD_SECRET = "a-perfectly-fine-random-secret-0123456789abcdef";

const base = (extra = {}) => ({ JWT_SECRET: GOOD_SECRET, ...extra });

function problems(env) {
    try {
        loadConfig(env);
    } catch (error) {
        assert.equal(error.name, "ConfigError");
        return error.problems;
    }

    return [];
}

test("minimal valid config applies safe development defaults", () => {
    const config = loadConfig(base());

    assert.equal(config.port, 4000);
    assert.deepEqual([...config.allowedOrigins], [
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ]);
    assert.equal(config.authEnabled, true);
    assert.equal(config.cookie.secure, false);
    assert.equal(config.cookie.sameSite, "lax");
    assert.equal(config.jwt.expiresInSeconds, 3600);
    assert.equal(config.db.database, "proxispeak");
    assert.equal(config.bcryptRounds, 12);
});

test("JWT_SECRET is required", () => {
    assert.ok(problems({}).some((p) => p.startsWith("JWT_SECRET is required")));
    assert.ok(problems({ JWT_SECRET: "   " }).some((p) => p.startsWith("JWT_SECRET is required")));
});

test("JWT_SECRET must be long enough", () => {
    assert.ok(problems({ JWT_SECRET: "short" }).some((p) => /at least 32/.test(p)));
});

test("placeholder JWT_SECRET from .env.example is rejected", () => {
    const placeholder = "replace-with-a-long-random-string-at-least-32-characters";
    assert.ok(problems({ JWT_SECRET: placeholder }).some((p) => /placeholder/.test(p)));
});

test("empty KEY= lines behave like unset", () => {
    const config = loadConfig(base({ COOKIE_DOMAIN: "", DB_PASSWORD: "", PORT: "" }));

    assert.equal(config.cookie.domain, undefined);
    assert.equal(config.db.password, "");
    assert.equal(config.port, 4000);
});

test("duration parsing: seconds, minutes, hours, days and limits", () => {
    assert.equal(loadConfig(base({ JWT_EXPIRES_IN: "900" })).jwt.expiresInSeconds, 900);
    assert.equal(loadConfig(base({ JWT_EXPIRES_IN: "30m" })).jwt.expiresInSeconds, 1800);
    assert.equal(loadConfig(base({ JWT_EXPIRES_IN: "2h" })).jwt.expiresInSeconds, 7200);
    assert.equal(loadConfig(base({ JWT_EXPIRES_IN: "7d" })).jwt.expiresInSeconds, 604800);
    assert.equal(loadConfig(base({ JWT_EXPIRES_IN: "1h" })).cookie.maxAgeMs, 3600000);

    assert.ok(problems(base({ JWT_EXPIRES_IN: "30s" })).length > 0);   // < 1 minute
    assert.ok(problems(base({ JWT_EXPIRES_IN: "8d" })).length > 0);    // > 7 days
    assert.ok(problems(base({ JWT_EXPIRES_IN: "forever" })).length > 0);
});

test("FRONTEND_ORIGINS: parsed, trimmed, de-duplicated, trailing slash removed", () => {
    const config = loadConfig(base({
        FRONTEND_ORIGINS: " https://app.example.org/ , http://localhost:5173,http://localhost:5173 "
    }));

    assert.deepEqual([...config.allowedOrigins], [
        "https://app.example.org",
        "http://localhost:5173"
    ]);
});

test("FRONTEND_ORIGINS rejects wildcard, paths and junk", () => {
    assert.ok(problems(base({ FRONTEND_ORIGINS: "*" })).length > 0);
    assert.ok(problems(base({ FRONTEND_ORIGINS: "http://localhost:5173/app" })).length > 0);
    assert.ok(problems(base({ FRONTEND_ORIGINS: "not a url" })).length > 0);
});

test("SameSite=None requires Secure cookies", () => {
    assert.ok(problems(base({ COOKIE_SAMESITE: "none", COOKIE_SECURE: "false" })).some((p) => /SameSite=None/.test(p)));
    assert.equal(loadConfig(base({ COOKIE_SAMESITE: "none", COOKIE_SECURE: "true" })).cookie.sameSite, "none");
    assert.ok(problems(base({ COOKIE_SAMESITE: "bogus" })).length > 0);
});

test("production: secure cookie, explicit origins and DB password are mandatory", () => {
    const found = problems(base({ NODE_ENV: "production" }));

    assert.ok(found.some((p) => /FRONTEND_ORIGINS must be set/.test(p)));
    assert.ok(found.some((p) => /DB_PASSWORD/.test(p)));

    const ok = loadConfig(base({
        NODE_ENV: "production",
        FRONTEND_ORIGINS: "https://app.example.org",
        DB_PASSWORD: "x",
        COOKIE_SAMESITE: "lax"
    }));

    assert.equal(ok.cookie.secure, true);                    // defaults to secure in production
    assert.ok(problems(base({
        NODE_ENV: "production",
        FRONTEND_ORIGINS: "https://app.example.org",
        DB_PASSWORD: "x",
        COOKIE_SECURE: "false"
    })).some((p) => /COOKIE_SECURE must be true/.test(p)));
});

test("all problems are reported in one error, and the secret is never echoed", () => {
    const secret = "short-secret-value";

    try {
        loadConfig({ JWT_SECRET: secret, PORT: "abc", BCRYPT_ROUNDS: "99" });
        assert.fail("should have thrown");
    } catch (error) {
        assert.ok(error.problems.length >= 3);
        assert.ok(!error.message.includes(secret));
    }
});

test("numeric settings are range checked", () => {
    assert.ok(problems(base({ BCRYPT_ROUNDS: "3" })).length > 0);
    assert.ok(problems(base({ BCRYPT_ROUNDS: "16" })).length > 0);
    assert.ok(problems(base({ DB_PORT: "0" })).length > 0);
    assert.ok(problems(base({ AUTH_ENABLED: "maybe" })).length > 0);
    assert.equal(loadConfig(base({ AUTH_ENABLED: "false" })).authEnabled, false);
});

test("loaded config is frozen", () => {
    const config = loadConfig(base());

    assert.throws(() => { "use strict"; config.port = 1; }, TypeError);
    assert.throws(() => { "use strict"; config.jwt.secret = "x"; }, TypeError);
});
