"use strict";

require("../helpers/env");

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { mockReq, mockRes, runChain } = require("../helpers/mocks");
const { originGuard } = require("../../middleware/origin.middleware");
const { createRateLimiter } = require("../../middleware/rateLimit.middleware");
const { errorHandler, notFoundHandler } = require("../../middleware/error.middleware");
const { AppError } = require("../../utils/errors");
const { connectionRefused } = require("../helpers/fakeDb");

const ALLOWED = ["http://localhost:5173", "http://127.0.0.1:5173"];

// ---------------- CSRF / origin guard ----------------

async function guard(req) {
    const res = mockRes();
    let passed = false;

    await runChain([originGuard(ALLOWED), (rq, rs) => { passed = true; rs.json({}); }], req, res);

    return { res, passed };
}

test("originGuard: POST from an allowed origin passes", async () => {
    for (const origin of ALLOWED) {
        assert.equal((await guard(mockReq({ headers: { origin } }))).passed, true);
    }
});

test("originGuard: POST from any other origin -> 403 (CSRF)", async () => {
    for (const origin of ["https://evil.example", "http://localhost:5174", "http://localhost:5173.evil.com", "null"]) {
        const { res, passed } = await guard(mockReq({ headers: { origin } }));

        assert.equal(passed, false, origin);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.code, "ORIGIN_NOT_ALLOWED");
    }
});

test("originGuard: browser-flagged cross-site request without Origin -> 403", async () => {
    const { res, passed } = await guard(mockReq({ headers: { "sec-fetch-site": "cross-site" } }));

    assert.equal(passed, false);
    assert.equal(res.statusCode, 403);
});

test("originGuard: same-site / no-Origin non-browser clients (Postman, curl) pass", async () => {
    assert.equal((await guard(mockReq())).passed, true);
    assert.equal((await guard(mockReq({ headers: { "sec-fetch-site": "same-site" } }))).passed, true);
});

test("originGuard: safe methods are never blocked (they change nothing)", async () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
        const { passed } = await guard(mockReq({ method, headers: { origin: "https://evil.example" } }));

        assert.equal(passed, true, method);
    }
});

// ---------------- rate limiter ----------------

function limiterRun(limiter, status, ip = "10.0.0.1") {
    const req = mockReq({ ip });
    const res = mockRes();
    let passed = false;

    return runChain([
        limiter,
        (rq, rs) => { passed = true; rs.status(status).json({}); }
    ], req, res).then(() => ({ res, passed }));
}

test("rateLimiter: blocks after `max` failed attempts and sets Retry-After", async () => {
    const limiter = createRateLimiter({ name: "t1", windowMs: 60000, max: 3 });

    for (let i = 0; i < 3; i++) {
        assert.equal((await limiterRun(limiter, 401)).res.statusCode, 401);
    }

    const blocked = await limiterRun(limiter, 401);

    assert.equal(blocked.passed, false);
    assert.equal(blocked.res.statusCode, 429);
    assert.equal(blocked.res.body.code, "RATE_LIMITED");
    assert.ok(Number(blocked.res.headers["retry-after"]) >= 1);
});

test("rateLimiter: successful requests are refunded, so normal users are not throttled", async () => {
    const limiter = createRateLimiter({ name: "t2", windowMs: 60000, max: 2 });

    for (let i = 0; i < 20; i++) {
        assert.equal((await limiterRun(limiter, 200)).res.statusCode, 200);
    }
});

test("rateLimiter: counted per IP", async () => {
    const limiter = createRateLimiter({ name: "t3", windowMs: 60000, max: 1 });

    await limiterRun(limiter, 401, "10.0.0.1");

    assert.equal((await limiterRun(limiter, 401, "10.0.0.1")).res.statusCode, 429);
    assert.equal((await limiterRun(limiter, 401, "10.0.0.2")).res.statusCode, 401);
});

test("rateLimiter: parallel burst cannot slip past the limit", async () => {
    const limiter = createRateLimiter({ name: "t4", windowMs: 60000, max: 5 });

    // Nothing finishes before all 50 have been counted (counted on arrival).
    const results = await Promise.all(Array.from({ length: 50 }, () => limiterRun(limiter, 401)));

    assert.equal(results.filter((r) => r.passed).length, 5);
    assert.equal(results.filter((r) => r.res.statusCode === 429).length, 45);
});

test("rateLimiter: window expiry resets the budget", async () => {
    const limiter = createRateLimiter({ name: "t5", windowMs: 50, max: 1 });

    await limiterRun(limiter, 401);
    assert.equal((await limiterRun(limiter, 401)).res.statusCode, 429);

    await new Promise((resolve) => setTimeout(resolve, 70));

    assert.equal((await limiterRun(limiter, 401)).res.statusCode, 401);
});

test("rateLimiter: can be disabled", async () => {
    const limiter = createRateLimiter({ name: "t6", windowMs: 60000, max: 1, enabled: false });

    for (let i = 0; i < 5; i++) {
        assert.equal((await limiterRun(limiter, 401)).res.statusCode, 401);
    }
});

// ---------------- error handler ----------------

function handle(error, req = mockReq({ method: "POST", path: "/api/auth/login" })) {
    const res = mockRes();
    errorHandler(error, req, res, () => assert.fail("next() must not be called"));
    return res;
}

function silenced(fn) {
    const original = console.error;
    const lines = [];
    console.error = (...a) => lines.push(a.map(String).join(" "));

    try {
        return { result: fn(), lines };
    } finally {
        console.error = original;
    }
}

test("errorHandler: AppError -> its own status/code/message/errors", () => {
    const res = handle(new AppError(409, "X", "msg", { email: "taken" }));

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { success: false, message: "msg", code: "X", errors: { email: "taken" } });
});

test("errorHandler: malformed JSON from express.json() -> 400, oversized -> 413", () => {
    const parse = Object.assign(new SyntaxError("Unexpected token } in JSON at position 5"), { type: "entity.parse.failed", status: 400 });
    const big = Object.assign(new Error("request entity too large"), { type: "entity.too.large", status: 413 });

    const a = handle(parse);
    const b = handle(big);

    assert.equal(a.statusCode, 400);
    assert.equal(a.body.code, "INVALID_JSON");
    assert.ok(!JSON.stringify(a.body).includes("position"));      // parser detail not echoed
    assert.equal(b.statusCode, 413);
});

test("errorHandler: database errors -> 503 with a generic message and a short log line", () => {
    const secretish = Object.assign(new Error("Access denied for user 'root'@'10.1.2.3' (using password: YES)"), { code: "ER_ACCESS_DENIED_ERROR" });

    for (const error of [connectionRefused(), secretish, Object.assign(new Error("x"), { code: "PROTOCOL_CONNECTION_LOST" })]) {
        const { result: res, lines } = silenced(() => handle(error));

        assert.equal(res.statusCode, 503);
        assert.equal(res.body.code, "DATABASE_UNAVAILABLE");
        assert.ok(!JSON.stringify(res.body).includes("root"));
        assert.ok(!JSON.stringify(res.body).includes("10.1.2.3"));
        assert.ok(lines.every((line) => !line.includes("10.1.2.3")));       // message not logged for DB errors
    }
});

test("errorHandler: unexpected errors -> 500 generic, details only in the server log", () => {
    const { result: res } = silenced(() => handle(new TypeError("Cannot read properties of undefined (reading 'secretField')")));

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.code, "INTERNAL_ERROR");
    assert.ok(!JSON.stringify(res.body).includes("secretField"));
});

test("errorHandler: if headers are already sent it defers to Express", () => {
    const res = mockRes();
    res.headersSent = true;

    let forwarded;
    errorHandler(new Error("late"), mockReq(), res, (e) => { forwarded = e; });

    assert.equal(forwarded.message, "late");
});

test("notFoundHandler: JSON 404", () => {
    const res = mockRes();
    notFoundHandler(mockReq({ method: "GET", path: "/api/nope" }), res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.code, "NOT_FOUND");
});
