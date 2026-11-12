"use strict";

// --------------------------------------------------
// 404 + CENTRAL ERROR HANDLER
//
// Clients only ever see { success:false, message, code, errors? }.
// SQL text, hostnames, stack traces and secrets stay in the server log
// (and even there only the error name/code/message are printed).
// --------------------------------------------------

const config = require("../config");
const { AppError, isDatabaseError } = require("../utils/errors");

function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        message: "Route not found.",
        code: "NOT_FOUND"
    });
}

function send(res, status, code, message, errors) {
    const body = { success: false, message, code };

    if (errors && Object.keys(errors).length > 0) {
        body.errors = errors;
    }

    res.status(status).json(body);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    if (error instanceof AppError) {
        return send(res, error.status, error.code, error.message, error.errors);
    }

    // Errors raised by express.json() (body-parser)
    if (error?.type === "entity.parse.failed") {
        return send(res, 400, "INVALID_JSON", "Request body is not valid JSON.");
    }

    if (error?.type === "entity.too.large") {
        return send(res, 413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    }

    if (
        Number.isInteger(error?.status) &&
        error.status >= 400 &&
        error.status < 500
    ) {
        return send(res, error.status, "BAD_REQUEST", "Bad request.");
    }

    if (isDatabaseError(error)) {
        console.error(
            `Database error while handling ${req.method} ${req.path}: ` +
            `${error.code || error.name}`
        );

        return send(
            res,
            503,
            "DATABASE_UNAVAILABLE",
            "The service is temporarily unavailable. Please try again later."
        );
    }

    console.error(
        `Unhandled error on ${req.method} ${req.path}: ` +
        `${error?.name || "Error"}: ${error?.message || error}`
    );

    if (!config.isProduction && error?.stack) {
        console.error(error.stack);
    }

    return send(res, 500, "INTERNAL_ERROR", "Something went wrong.");
}

module.exports = { notFoundHandler, errorHandler };
