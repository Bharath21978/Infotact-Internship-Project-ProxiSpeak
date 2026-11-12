"use strict";

// In-memory stand-in for a mysql2/promise pool, supporting exactly the
// statements used by models/*.js. Deliberately strict so that a model
// change that is not mirrored here fails loudly instead of silently
// passing:
//   - unknown SQL throws
//   - number of "?" must equal number of parameters
//   - SELECT only returns the columns it names (so password_hash can
//     never "leak" through a query that did not ask for it)
//   - users.email is UNIQUE, case-insensitively (like MySQL's default
//     collation), and violations raise ER_DUP_ENTRY / errno 1062

function createFakeDb() {
    const state = {
        users: [],
        revoked: new Map(),
        queries: [],
        failure: null,
        nextId: 1
    };

    function normalise(sql) {
        return sql.replace(/\s+/g, " ").trim();
    }

    function project(row, selectList) {
        const out = {};

        for (const column of selectList.split(",").map((c) => c.trim())) {
            out[column] = row[column];
        }

        return out;
    }

    async function execute(rawSql, params = []) {
        const sql = normalise(rawSql);

        state.queries.push({ sql, params });

        if (state.failure) throw state.failure;

        const placeholders = (sql.match(/\?/g) || []).length;

        if (placeholders !== params.length) {
            throw new Error(
                `FakeDb: ${placeholders} placeholders but ${params.length} params: ${sql}`
            );
        }

        let match;

        if ((match = /^SELECT (.+) FROM users WHERE email = \? LIMIT 1$/.exec(sql))) {
            const email = String(params[0]).toLowerCase();
            const row = state.users.find((u) => u.email.toLowerCase() === email);
            return [row ? [project(row, match[1])] : [], []];
        }

        if ((match = /^SELECT (.+) FROM users WHERE id = \? LIMIT 1$/.exec(sql))) {
            const row = state.users.find((u) => u.id === params[0]);
            return [row ? [project(row, match[1])] : [], []];
        }

        if (sql === "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)") {
            const [username, email, password_hash] = params;

            if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
                const error = new Error("Duplicate entry for key 'uq_users_email'");
                error.code = "ER_DUP_ENTRY";
                error.errno = 1062;
                throw error;
            }

            const row = {
                id: state.nextId++,
                username,
                email,
                password_hash,
                created_at: new Date()
            };

            state.users.push(row);

            return [{ insertId: row.id, affectedRows: 1 }, undefined];
        }

        if (sql === "INSERT INTO revoked_tokens (jti, user_id, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE jti = jti") {
            const [jti, user_id, expires_at] = params;

            if (!state.revoked.has(jti)) {
                state.revoked.set(jti, { jti, user_id, expires_at });
            }

            return [{ affectedRows: 1 }, undefined];
        }

        if ((match = /^SELECT (.+) FROM revoked_tokens WHERE jti = \? LIMIT 1$/.exec(sql))) {
            const row = state.revoked.get(params[0]);
            return [row ? [project(row, match[1])] : [], []];
        }

        if (sql === "DELETE FROM revoked_tokens WHERE expires_at < ?") {
            for (const [jti, row] of state.revoked) {
                if (row.expires_at < params[0]) state.revoked.delete(jti);
            }

            return [{ affectedRows: 0 }, undefined];
        }

        throw new Error(`FakeDb: unrecognised SQL: ${sql}`);
    }

    async function query(sql) {
        if (state.failure) throw state.failure;

        if (normalise(sql) === "SELECT 1") return [[{ 1: 1 }], []];

        throw new Error(`FakeDb: unrecognised query(): ${sql}`);
    }

    return {
        pool: { execute, query, end: async () => {} },

        get users() { return state.users; },
        get revoked() { return state.revoked; },
        get queries() { return state.queries; },

        // Simulate an outage, e.g. fail(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))
        fail(error) { state.failure = error; },
        recover() { state.failure = null; },

        // Back to an empty database (like TRUNCATE: ids restart at 1).
        reset() {
            state.users.length = 0;
            state.revoked.clear();
            state.queries.length = 0;
            state.failure = null;
            state.nextId = 1;
        }
    };
}

function connectionRefused() {
    return Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3306"), {
        code: "ECONNREFUSED"
    });
}

module.exports = { createFakeDb, connectionRefused };
