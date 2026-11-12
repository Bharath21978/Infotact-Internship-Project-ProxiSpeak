"use strict";

// --------------------------------------------------
// ERROR TYPES AND HELPERS
//
// Every error response has the same shape:
//   { success: false, message, code, errors? }
// `errors` (optional) maps field name -> message for form validation.
// Internal details (SQL, stack traces, hosts) never reach the client.
// --------------------------------------------------

class AppError extends Error {
    constructor(status, code, message, errors) {
        super(message);
        this.name = "AppError";
        this.status = status;
        this.code = code;
        this.errors = errors;
    }
}

// Node network error codes and MySQL error codes that mean
// "the database is not reachable / not set up", as opposed to a bug.
const DATABASE_UNAVAILABLE_CODES = new Set([
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EHOSTUNREACH",
    "PROTOCOL_CONNECTION_LOST",
    "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
    "POOL_CLOSED"
]);

function isDuplicateEntryError(error) {
    return error?.code === "ER_DUP_ENTRY" || error?.errno === 1062;
}

function isDatabaseError(error) {
    if (!error) return false;

    if (DATABASE_UNAVAILABLE_CODES.has(error.code)) return true;

    // Any other MySQL server error (access denied, unknown database,
    // missing table, ...) is a deployment/setup problem for the caller.
    return typeof error.code === "string" && error.code.startsWith("ER_");
}

module.exports = { AppError, isDatabaseError, isDuplicateEntryError };
