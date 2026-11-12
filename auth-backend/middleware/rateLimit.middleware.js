"use strict";

// --------------------------------------------------
// FAILED-ATTEMPT RATE LIMITER (brute-force protection)
//
// Counts requests per client IP in a fixed window. A request is counted
// when it arrives (so a burst of parallel guesses cannot slip through)
// and refunded when it finishes successfully (< 400), so normal users
// are not penalised. Once the budget is spent, further requests get 429
// until the window ends.
//
// LIMITATION: in-memory and per-process. With several server instances
// use a shared store (e.g. Redis) instead.
// --------------------------------------------------

const { AppError } = require("../utils/errors");

function createRateLimiter({ name, windowMs, max, enabled = true }) {
    const hits = new Map();

    if (enabled) {
        const sweep = setInterval(() => {
            const now = Date.now();

            for (const [key, entry] of hits) {
                if (entry.resetAt <= now) hits.delete(key);
            }
        }, Math.min(windowMs, 60 * 1000));

        // Never keep the process alive just for housekeeping.
        sweep.unref();
    }

    return function rateLimiter(req, res, next) {
        if (!enabled) return next();

        const key = `${name}:${req.ip}`;
        const now = Date.now();

        let entry = hits.get(key);

        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }

        entry.count += 1;

        if (entry.count > max) {
            const retryAfter = Math.max(
                1,
                Math.ceil((entry.resetAt - now) / 1000)
            );

            res.set("Retry-After", String(retryAfter));

            return next(
                new AppError(
                    429,
                    "RATE_LIMITED",
                    "Too many attempts. Please try again later."
                )
            );
        }

        res.on("finish", () => {
            if (res.statusCode < 400 && entry.count > 0) {
                entry.count -= 1;
            }
        });

        next();
    };
}

module.exports = { createRateLimiter };
