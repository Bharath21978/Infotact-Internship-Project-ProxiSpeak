-- ============================================================
-- ProxiSpeak database schema (MySQL 8.x / MariaDB 10.5+)
--
-- Run with:   mysql -u root -p < database/schema.sql
-- Safe to re-run: every statement is IF NOT EXISTS.
-- ============================================================

CREATE DATABASE IF NOT EXISTS proxispeak
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE proxispeak;

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            INT           NOT NULL AUTO_INCREMENT,
    username      VARCHAR(50)   NOT NULL,
    email         VARCHAR(100)  NOT NULL,
    password_hash VARCHAR(255)  NOT NULL,
    created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- revoked_tokens
--
-- Logout strategy: every JWT carries a unique id (jti). On logout the
-- jti is stored here until the token would have expired anyway; the
-- auth middleware and the Socket.IO handshake reject revoked jtis.
-- expires_at is a Unix timestamp in seconds (UTC), copied from the
-- JWT "exp" claim, so rows older than "now" can be purged safely.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti        CHAR(36)         NOT NULL,
    user_id    INT              NOT NULL,
    expires_at BIGINT UNSIGNED  NOT NULL,
    revoked_at TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (jti),
    KEY idx_revoked_tokens_expires_at (expires_at),
    CONSTRAINT fk_revoked_tokens_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
