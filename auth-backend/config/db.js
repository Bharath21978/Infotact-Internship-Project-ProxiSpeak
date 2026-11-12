"use strict";

// --------------------------------------------------
// MYSQL CONNECTION POOL
//
// One reusable pool for the whole process. It is created lazily so that
// requiring this module never opens a connection (and so unit tests can
// inject a fake pool with setPool()).
//
// Credentials come from environment variables via config/index.js and
// are never logged.
// --------------------------------------------------

const config = require("./index");

let pool = null;

function createPool() {
    // Required lazily so the module can be loaded without mysql2 present
    // (e.g. in unit tests that inject a fake pool).
    const mysql = require("mysql2/promise");

    return mysql.createPool({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
        waitForConnections: true,
        connectionLimit: config.db.connectionLimit,
        queueLimit: 0,
        connectTimeout: 10000,
        enableKeepAlive: true,
        charset: "utf8mb4"
    });
}

function getPool() {
    if (!pool) {
        pool = createPool();
    }

    return pool;
}

// Test seam: replace the pool with a fake.
function setPool(replacement) {
    pool = replacement;
}

async function closePool() {
    if (pool && typeof pool.end === "function") {
        await pool.end();
    }

    pool = null;
}

// Returns true/false and logs a short, credential-free reason on failure.
async function checkConnection() {
    try {
        await getPool().query("SELECT 1");
        return true;
    } catch (error) {
        console.error(
            `MySQL connection check failed ` +
            `(${error?.code || error?.name || "UNKNOWN"}) ` +
            `[host=${config.db.host} port=${config.db.port} ` +
            `database=${config.db.database} user=${config.db.user}]`
        );
        return false;
    }
}

module.exports = { getPool, setPool, closePool, checkConnection };
