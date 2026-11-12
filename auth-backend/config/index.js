"use strict";

// Loads .env (except under the test runner, so tests stay hermetic and
// never pick up a developer's real credentials) and exports the
// validated configuration. Throws a ConfigError if anything is wrong.

if (process.env.NODE_ENV !== "test") {
    require("dotenv").config();
}

const { loadConfig } = require("./env");

module.exports = loadConfig(process.env);
