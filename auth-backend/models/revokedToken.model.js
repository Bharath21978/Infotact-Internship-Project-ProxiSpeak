"use strict";

// --------------------------------------------------
// REVOKED TOKEN MODEL  (logout support)
//
// expiresAt is the JWT "exp" claim (Unix seconds). A row is only needed
// until then; after that the token is rejected for being expired.
// --------------------------------------------------

const { getPool } = require("../config/db");

async function revoke({ jti, userId, expiresAt }) {
    await getPool().execute(
        "INSERT INTO revoked_tokens (jti, user_id, expires_at) " +
        "VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE jti = jti",
        [jti, userId, expiresAt]
    );
}

async function isRevoked(jti) {
    const [rows] = await getPool().execute(
        "SELECT jti FROM revoked_tokens WHERE jti = ? LIMIT 1",
        [jti]
    );

    return rows.length > 0;
}

async function purgeExpired(nowSeconds) {
    await getPool().execute(
        "DELETE FROM revoked_tokens WHERE expires_at < ?",
        [nowSeconds]
    );
}

module.exports = { revoke, isRevoked, purgeExpired };
