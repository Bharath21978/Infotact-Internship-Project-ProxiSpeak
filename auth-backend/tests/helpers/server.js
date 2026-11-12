"use strict";

// Boots the REAL server.js (Express + Socket.IO) on an ephemeral port
// with a fake MySQL pool, so integration tests need no database.

const { createFakeDb } = require("./fakeDb");

async function startServer(env = {}) {
    Object.assign(process.env, {
        NODE_ENV: "test",
        JWT_SECRET: "integration-test-jwt-secret-0123456789-abcdefghijklmnop",
        BCRYPT_ROUNDS: "4",
        AUTH_RATE_LIMIT_MAX: "1000",
        FRONTEND_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
        ...env
    });

    const db = createFakeDb();

    require("../../config/db").setPool(db.pool);

    const app = require("../../server");

    await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));

    const { port } = app.server.address();

    return {
        ...app,
        db,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        secret: process.env.JWT_SECRET,
        close: () => new Promise((resolve) => { app.io.close(() => resolve()); })
    };
}

module.exports = { startServer };
