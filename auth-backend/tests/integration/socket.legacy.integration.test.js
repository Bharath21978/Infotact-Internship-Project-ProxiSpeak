"use strict";

// NOT EXECUTED by the author (needs npm install).
//
// Proves the multiplayer behaviour did not change.
//   Default:     boots the new server with AUTH_ENABLED=false.
//   Baseline:    run the SAME assertions against your ORIGINAL server:
//                  git stash / checkout the original server.js, `node server.js`, then
//                  TARGET_URL=http://127.0.0.1:4000 node --test tests/integration/socket.legacy.integration.test.js

const { test, before, after } = require("node:test");

const { startServer } = require("../helpers/server");
const { connect } = require("../helpers/sioClient");
const { defineMultiplayerTests } = require("../helpers/multiplayerScenarios");

const ORIGIN = "http://localhost:5173";
let server;
let url = process.env.TARGET_URL;

before(async () => {
    if (!url) {
        server = await startServer({ AUTH_ENABLED: "false" });
        url = server.baseUrl;
    }
});

after(async () => { if (server) await server.close(); });

defineMultiplayerTests(test, () => connect({ url, origin: ORIGIN }));
