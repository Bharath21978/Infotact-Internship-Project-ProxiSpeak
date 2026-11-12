"use strict";

const express = require("express");

const config = require("../config");
const controller = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { createRateLimiter } = require("../middleware/rateLimit.middleware");

const router = express.Router();

const limiterOptions = {
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    enabled: config.rateLimit.enabled
};

const loginLimiter = createRateLimiter({ name: "login", ...limiterOptions });
const registerLimiter = createRateLimiter({ name: "register", ...limiterOptions });

// Auth responses are per-user and must never be cached or sniffed.
router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    next();
});

router.post("/register", registerLimiter, controller.register);
router.post("/login", loginLimiter, controller.login);
router.get("/me", requireAuth, controller.me);
router.post("/logout", controller.logout);

module.exports = router;
