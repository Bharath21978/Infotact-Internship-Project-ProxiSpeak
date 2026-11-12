"use strict";

// --------------------------------------------------
// USER MODEL
//
// All SQL is parameterised (`?` placeholders with execute()), so user
// input is never concatenated into a query.
// --------------------------------------------------

const { getPool } = require("../config/db");

// The only user fields that may ever be sent to a client.
function toPublicUser(row) {
    return {
        id: row.id,
        username: row.username,
        email: row.email
    };
}

async function emailExists(email) {
    const [rows] = await getPool().execute(
        "SELECT id FROM users WHERE email = ? LIMIT 1",
        [email]
    );

    return rows.length > 0;
}

// Includes password_hash: internal use only (login). Never serialise.
async function findByEmail(email) {
    const [rows] = await getPool().execute(
        "SELECT id, username, email, password_hash FROM users " +
        "WHERE email = ? LIMIT 1",
        [email]
    );

    return rows[0] || null;
}

async function findById(id) {
    const [rows] = await getPool().execute(
        "SELECT id, username, email FROM users WHERE id = ? LIMIT 1",
        [id]
    );

    return rows[0] || null;
}

async function create({ username, email, passwordHash }) {
    const [result] = await getPool().execute(
        "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
        [username, email, passwordHash]
    );

    return { id: result.insertId, username, email };
}

module.exports = { toPublicUser, emailExists, findByEmail, findById, create };
