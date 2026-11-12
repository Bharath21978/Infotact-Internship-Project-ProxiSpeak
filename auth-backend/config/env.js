"use strict";

// --------------------------------------------------
// ENVIRONMENT CONFIGURATION
//
// loadConfig() is a pure function: it reads a plain object (normally
// process.env), validates it and returns a frozen config object.
// It never prints or returns secrets anywhere except in the returned
// object, and it throws ONE error listing every problem so a
// misconfigured .env can be fixed in a single pass.
// --------------------------------------------------

const DEFAULT_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173"
];

const MIN_JWT_SECRET_LENGTH = 32;

// Anything containing these is treated as an un-edited template value.
const PLACEHOLDER_MARKERS = [
    "replace-with",
    "change-me",
    "changeme",
    "your-secret",
    "your_secret",
    "example"
];

const MAX_TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const MIN_TOKEN_LIFETIME_SECONDS = 60;

function read(env, key) {
    const value = env[key];

    if (value === undefined || value === null) return undefined;

    const trimmed = String(value).trim();

    // `KEY=` in a .env file means "unset".
    return trimmed === "" ? undefined : trimmed;
}

function parseBoolean(raw, fallback, name, errors) {
    if (raw === undefined) return fallback;

    const value = raw.toLowerCase();

    if (["true", "1", "yes"].includes(value)) return true;
    if (["false", "0", "no"].includes(value)) return false;

    errors.push(`${name} must be "true" or "false"`);
    return fallback;
}

function parseInteger(raw, fallback, { name, min, max }, errors) {
    if (raw === undefined) return fallback;

    if (!/^\d+$/.test(raw)) {
        errors.push(`${name} must be a whole number`);
        return fallback;
    }

    const value = Number(raw);

    if (value < min || value > max) {
        errors.push(`${name} must be between ${min} and ${max}`);
        return fallback;
    }

    return value;
}

// "900" | "30m" | "1h" | "7d"  ->  seconds
function parseDurationSeconds(raw, fallback, name, errors) {
    if (raw === undefined) return fallback;

    const match = /^(\d+)\s*([smhd]?)$/i.exec(raw);

    if (!match) {
        errors.push(`${name} must look like 900, 30m, 1h or 7d`);
        return fallback;
    }

    const unitSeconds = { "": 1, s: 1, m: 60, h: 3600, d: 86400 };
    const seconds = Number(match[1]) * unitSeconds[match[2].toLowerCase()];

    if (
        seconds < MIN_TOKEN_LIFETIME_SECONDS ||
        seconds > MAX_TOKEN_LIFETIME_SECONDS
    ) {
        errors.push(`${name} must be between 1 minute and 7 days`);
        return fallback;
    }

    return seconds;
}

function parseOrigins(raw, isProduction, errors) {
    if (raw === undefined) {
        if (isProduction) {
            errors.push(
                "FRONTEND_ORIGINS must be set in production " +
                "(comma-separated list of allowed frontend origins)"
            );
        }

        return [...DEFAULT_DEV_ORIGINS];
    }

    const origins = [];

    for (const item of raw.split(",")) {
        const origin = item.trim().replace(/\/+$/, "");

        if (!origin) continue;

        let parsed;

        try {
            parsed = new URL(origin);
        } catch {
            errors.push(`FRONTEND_ORIGINS contains an invalid URL: ${origin}`);
            continue;
        }

        if (
            !["http:", "https:"].includes(parsed.protocol) ||
            parsed.origin !== origin
        ) {
            errors.push(
                `FRONTEND_ORIGINS entries must be plain origins such as ` +
                `http://localhost:5173 (no path, no wildcard): ${origin}`
            );
            continue;
        }

        if (!origins.includes(origin)) origins.push(origin);
    }

    if (origins.length === 0) {
        errors.push("FRONTEND_ORIGINS must contain at least one origin");
    }

    return origins;
}

function validateJwtSecret(secret, errors) {
    if (secret === undefined) {
        errors.push(
            "JWT_SECRET is required. Generate one with: " +
            "node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
        );
        return;
    }

    if (secret.length < MIN_JWT_SECRET_LENGTH) {
        errors.push(
            `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long`
        );
        return;
    }

    const lowered = secret.toLowerCase();

    if (PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker))) {
        errors.push(
            "JWT_SECRET still contains a placeholder value from .env.example. " +
            "Replace it with a freshly generated random secret."
        );
    }
}

function loadConfig(env = process.env) {
    const errors = [];

    const nodeEnv = read(env, "NODE_ENV") || "development";
    const isProduction = nodeEnv === "production";

    // ---- cookie ----
    const secure = parseBoolean(
        read(env, "COOKIE_SECURE"),
        isProduction,
        "COOKIE_SECURE",
        errors
    );

    const sameSite = (read(env, "COOKIE_SAMESITE") || "lax").toLowerCase();

    if (!["lax", "strict", "none"].includes(sameSite)) {
        errors.push('COOKIE_SAMESITE must be "lax", "strict" or "none"');
    }

    if (sameSite === "none" && !secure) {
        errors.push(
            'COOKIE_SAMESITE=none requires COOKIE_SECURE=true ' +
            "(browsers reject SameSite=None cookies that are not Secure)"
        );
    }

    if (isProduction && !secure) {
        errors.push("COOKIE_SECURE must be true in production");
    }

    // ---- jwt ----
    const jwtSecret = read(env, "JWT_SECRET");
    validateJwtSecret(jwtSecret, errors);

    const tokenLifetimeSeconds = parseDurationSeconds(
        read(env, "JWT_EXPIRES_IN"),
        3600,
        "JWT_EXPIRES_IN",
        errors
    );

    // ---- database ----
    const dbPassword = read(env, "DB_PASSWORD") || "";

    if (isProduction && !dbPassword) {
        errors.push("DB_PASSWORD must be set in production");
    }

    const config = {
        env: nodeEnv,
        isProduction,

        port: parseInteger(read(env, "PORT"), 4000, {
            name: "PORT", min: 0, max: 65535
        }, errors),

        allowedOrigins: parseOrigins(
            read(env, "FRONTEND_ORIGINS"),
            isProduction,
            errors
        ),

        // When true, Socket.IO rejects connections without a valid
        // auth cookie. When false, anonymous sockets are allowed
        // (legacy/dev mode) but a valid cookie is still recognised.
        authEnabled: parseBoolean(
            read(env, "AUTH_ENABLED"),
            true,
            "AUTH_ENABLED",
            errors
        ),

        // Optional comma-separated allow-list of joinable room ids.
        // Empty = any well-formed room id (previous behaviour).
        allowedRoomIds: (read(env, "ALLOWED_ROOM_IDS") || "")
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0 && id.length <= 50),

        // Number of reverse-proxy hops to trust for req.ip. 0 = none.
        trustProxy: parseInteger(read(env, "TRUST_PROXY"), 0, {
            name: "TRUST_PROXY", min: 0, max: 10
        }, errors),

        db: {
            host: read(env, "DB_HOST") || "localhost",
            port: parseInteger(read(env, "DB_PORT"), 3306, {
                name: "DB_PORT", min: 1, max: 65535
            }, errors),
            user: read(env, "DB_USER") || "root",
            password: dbPassword,
            database: read(env, "DB_NAME") || "proxispeak",
            connectionLimit: parseInteger(
                read(env, "DB_CONNECTION_LIMIT"),
                10,
                { name: "DB_CONNECTION_LIMIT", min: 1, max: 100 },
                errors
            )
        },

        jwt: {
            secret: jwtSecret,
            algorithm: "HS256",
            issuer: "proxispeak",
            audience: "proxispeak-web",
            expiresInSeconds: tokenLifetimeSeconds
        },

        cookie: {
            name: read(env, "COOKIE_NAME") || "proxispeak_token",
            secure,
            sameSite,
            domain: read(env, "COOKIE_DOMAIN"),
            maxAgeMs: tokenLifetimeSeconds * 1000
        },

        bcryptRounds: parseInteger(read(env, "BCRYPT_ROUNDS"), 12, {
            name: "BCRYPT_ROUNDS", min: 4, max: 15
        }, errors),

        rateLimit: {
            enabled: parseBoolean(
                read(env, "AUTH_RATE_LIMIT_ENABLED"),
                true,
                "AUTH_RATE_LIMIT_ENABLED",
                errors
            ),
            max: parseInteger(read(env, "AUTH_RATE_LIMIT_MAX"), 20, {
                name: "AUTH_RATE_LIMIT_MAX", min: 1, max: 100000
            }, errors),
            windowMs: parseInteger(
                read(env, "AUTH_RATE_LIMIT_WINDOW_MINUTES"),
                15,
                { name: "AUTH_RATE_LIMIT_WINDOW_MINUTES", min: 1, max: 1440 },
                errors
            ) * 60 * 1000
        }
    };

    if (errors.length > 0) {
        const error = new Error(
            "Invalid ProxiSpeak configuration:\n" +
            errors.map((message) => `  - ${message}`).join("\n")
        );

        error.name = "ConfigError";
        error.problems = errors;
        throw error;
    }

    // Shallow-freeze the sections so nothing mutates config at runtime.
    for (const key of ["db", "jwt", "cookie", "rateLimit"]) {
        Object.freeze(config[key]);
    }

    Object.freeze(config.allowedOrigins);
    Object.freeze(config.allowedRoomIds);

    return Object.freeze(config);
}

module.exports = { loadConfig, DEFAULT_DEV_ORIGINS };
