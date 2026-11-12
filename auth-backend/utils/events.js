"use strict";

const { EventEmitter } = require("events");

// In-process event bus that decouples the HTTP auth layer from the
// Socket.IO layer.
//
//   "logout"  { jti, userId }  -> sockets using that session are closed
module.exports = new EventEmitter();
