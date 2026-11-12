"use strict";

// Require this FIRST in every test file. It must run before anything
// that reads config, because config is validated once at require time.
// NODE_ENV=test also stops config/index.js from loading a real .env.

const defaults = {
    NODE_ENV: "test",
    JWT_SECRET: "unit-test-jwt-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
    JWT_EXPIRES_IN: "1h",
    BCRYPT_ROUNDS: "4",
    AUTH_ENABLED: "true",
    AUTH_RATE_LIMIT_MAX: "1000",
    FRONTEND_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
    COOKIE_SECURE: "false",
    COOKIE_SAMESITE: "lax",
    DB_NAME: "proxispeak_test"
};

for (const [key, value] of Object.entries(defaults)) {
    if (process.env[key] === undefined) process.env[key] = value;
}

module.exports = { TEST_JWT_SECRET: process.env.JWT_SECRET };
