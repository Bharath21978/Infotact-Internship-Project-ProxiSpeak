

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

// Validated configuration (reads .env). Exits with a clear message when
// something required, such as JWT_SECRET, is missing or invalid.
let config;

try {
    config = require("./config");
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

const authRoutes = require("./routes/auth.routes");
const { originGuard } = require("./middleware/origin.middleware");
const {
    notFoundHandler,
    errorHandler
} = require("./middleware/error.middleware");
const { checkConnection } = require("./config/db");
const socketAuth = require("./sockets/socketAuth");

const app = express();
const server = http.createServer(app);

// Defaults are unchanged: port 4000, frontend on localhost:5173.
const PORT = config.port;

const ALLOWED_ORIGINS = config.allowedOrigins;

const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
        // Lets the browser send/accept the auth cookie
        // (client uses withCredentials: true).
        credentials: true
    },
    // Rejects handshakes from browsers on a foreign Origin.
    allowRequest: socketAuth.allowRequest
});

// roomId -> Map(socket.id -> player)
const rooms = new Map();

// socket.id -> roomId
const socketRooms = new Map();

// --------------------------------------------------
// HTTP MIDDLEWARE
// Order matters: CORS first (so preflight requests succeed), then the
// CSRF origin guard, then JSON parsing, then the auth routes.
// --------------------------------------------------

if (config.trustProxy > 0) {
    app.set("trust proxy", config.trustProxy);
}

app.disable("x-powered-by");

app.use(cors({
    origin(origin, callback) {
        callback(null, !origin || ALLOWED_ORIGINS.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600
}));

app.use("/api", originGuard(ALLOWED_ORIGINS));
app.use("/api", express.json({ limit: "10kb" }));

app.use("/api/auth", authRoutes);
app.use("/api", notFoundHandler);

// --------------------------------------------------
// HTTP ENDPOINTS
// --------------------------------------------------

app.get("/", (req, res) => {
    res.send("ProxiSpeak Backend is Running!");
});

app.get("/health", async (req, res) => {
    res.json({
        status: "ok",
        service: "ProxiSpeak Backend",
        port: PORT,
        database: (await checkConnection()) ? "up" : "down"
    });
});

// --------------------------------------------------
// VALIDATION HELPERS
// --------------------------------------------------

// Optional allow-list (ALLOWED_ROOM_IDS in .env, comma-separated). When
// set, only those room ids can be joined. When empty, any well-formed id
// is accepted (previous behaviour), because the real room ids live in the
// frontend and must be copied here exactly.
const ALLOWED_ROOM_IDS = new Set(config.allowedRoomIds || []);

function validRoomId(roomId) {
    return (
        typeof roomId === "string" &&
        roomId.trim().length > 0 &&
        roomId.length <= 50 &&
        (ALLOWED_ROOM_IDS.size === 0 || ALLOWED_ROOM_IDS.has(roomId))
    );
}

function validPosition(x, y) {
    return (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        x >= 0 &&
        x <= 1200 &&
        y >= 0 &&
        y <= 720
    );
}

function validDescription(description, expectedType) {
    return (
        description !== null &&
        typeof description === "object" &&
        description.type === expectedType &&
        typeof description.sdp === "string" &&
        description.sdp.length > 0 &&
        description.sdp.length <= 100000
    );
}

function validIceCandidate(candidate) {
    if (
        candidate === null ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
    ) {
        return false;
    }

    if (
        typeof candidate.candidate !== "string" ||
        candidate.candidate.length > 4096
    ) {
        return false;
    }

    if (
        candidate.sdpMid != null &&
        typeof candidate.sdpMid !== "string"
    ) {
        return false;
    }

    if (
        candidate.sdpMLineIndex != null &&
        (!Number.isInteger(candidate.sdpMLineIndex) ||
            candidate.sdpMLineIndex < 0)
    ) {
        return false;
    }

    if (
        candidate.usernameFragment != null &&
        typeof candidate.usernameFragment !== "string"
    ) {
        return false;
    }

    return true;
}

// --------------------------------------------------
// PLAYER BROADCASTING
// --------------------------------------------------

function broadcastPlayers(roomId) {
    const room = rooms.get(roomId);

    if (!room) return;

    for (const [socketId] of room.entries()) {
        const socket = io.sockets.sockets.get(socketId);

        if (!socket) continue;

        const otherPlayers = [...room.entries()]
            .filter(([otherSocketId]) => otherSocketId !== socketId)
            .map(([, player]) => ({ ...player }));

        socket.emit("players:update", otherPlayers);
    }
}

// --------------------------------------------------
// ROOM CLEANUP
// --------------------------------------------------

function leaveRoom(socket) {
    const roomId = socketRooms.get(socket.id);

    if (!roomId) return;

    const room = rooms.get(roomId);

    if (room) {
        room.delete(socket.id);
    }

    socketRooms.delete(socket.id);
    socket.leave(roomId);

    // Clear stale remote-player state for the leaving client.
    socket.emit("players:update", []);

    console.log(`Client ${socket.id} left room ${roomId}`);

    if (room && room.size === 0) {
        rooms.delete(roomId);
    } else {
        broadcastPlayers(roomId);
    }
}

// --------------------------------------------------
// WEBRTC SIGNALING
// --------------------------------------------------

function relayWebRTC(socket, eventName, data, payload) {
    const roomId = socketRooms.get(socket.id);

    // Sender must have joined the room.
    if (!roomId || data?.roomId !== roomId) {
        console.log("Rejected signaling: room mismatch", socket.id);
        return;
    }

    const targetId = data?.to;

    if (
        typeof targetId !== "string" ||
        targetId.length === 0 ||
        targetId === socket.id
    ) {
        console.log("Rejected signaling: invalid target", socket.id);
        return;
    }

    // Verify the recipient belongs to the sender's room.
    const room = rooms.get(roomId);

    if (!room || !room.has(targetId)) {
        console.log("Rejected signaling: target not in room", targetId);
        return;
    }

    const targetSocket = io.sockets.sockets.get(targetId);

    if (!targetSocket || socketRooms.get(targetId) !== roomId) {
        console.log("Rejected signaling: target disconnected", targetId);
        return;
    }

    targetSocket.emit(eventName, {
        from: socket.id,
        roomId,
        ...payload
    });

    console.log(
        `Relayed ${eventName} from ${socket.id} to ${targetId} in ${roomId}`
    );
}

// --------------------------------------------------
// SOCKET.IO EVENTS
// --------------------------------------------------

// Authentication (see sockets/socketAuth.js). The handshake middleware
// verifies the auth cookie; protectSocket guards every incoming event.
// It is registered BEFORE the handler below so its guard runs first.
io.use(socketAuth.authMiddleware);
io.on("connection", socketAuth.protectSocket);
socketAuth.attachLogoutHandler(io);

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // ----------------------------------------------
    // JOIN ROOM
    // ----------------------------------------------

    socket.on("player:join", (data) => {
        const roomId = data?.roomId;
        const player = data?.player;

        if (
            !validRoomId(roomId) ||
            !player ||
            typeof player.id !== "string" ||
            player.id.trim().length === 0 ||
            player.id.length > 100 ||
            !validPosition(player.x, player.y)
        ) {
            console.log("Invalid player:join payload from", socket.id);
            return;
        }

        // Avoid stale membership when switching rooms.
        leaveRoom(socket);

        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
        }

        // Identity comes from the verified session, never from the
        // client. With auth disabled (local debugging only) the old
        // client-supplied values are used, exactly as before.
        const trusted = socket.data.user;

        const safePlayer = {
            id: trusted ? String(trusted.id) : player.id,
            name: trusted
                ? String(trusted.username).slice(0, 30)
                : String(player.name || "Guest").slice(0, 30),
            role: trusted
                ? "Participant"
                : String(player.role || "Participant").slice(0, 35),
            color:
                typeof player.color === "string" &&
                /^#[0-9a-f]{6}$/i.test(player.color)
                    ? player.color
                    : "#8eaaff",
            x: player.x,
            y: player.y
        };

        const room = rooms.get(roomId);

        room.set(socket.id, safePlayer);
        socketRooms.set(socket.id, roomId);
        socket.join(roomId);

        console.log(
            `${safePlayer.name} joined room ${roomId} ` +
            `at (${safePlayer.x}, ${safePlayer.y})`
        );

        broadcastPlayers(roomId);
    });

    // ----------------------------------------------
    // PLAYER MOVEMENT
    // ----------------------------------------------

    socket.on("player:move", (data) => {
        const roomId = socketRooms.get(socket.id);

        if (!roomId || data?.roomId !== roomId) {
            return;
        }

        if (!validPosition(data.x, data.y)) {
            console.log("Invalid movement from", socket.id);
            return;
        }

        const room = rooms.get(roomId);
        const player = room?.get(socket.id);

        if (!player) return;

        player.x = data.x;
        player.y = data.y;

        broadcastPlayers(roomId);
    });

    // ----------------------------------------------
    // LEAVE ROOM
    // ----------------------------------------------

    socket.on("player:leave", () => {
        leaveRoom(socket);
    });

    // ----------------------------------------------
    // WEBRTC OFFER
    // Payload: { roomId, to, description }
    // ----------------------------------------------

    socket.on("rtc:offer", (data) => {
        if (!validDescription(data?.description, "offer")) {
            console.log("Invalid WebRTC offer from", socket.id);
            return;
        }

        relayWebRTC(socket, "rtc:offer", data, {
            description: data.description
        });
    });

    // ----------------------------------------------
    // WEBRTC ANSWER
    // Payload: { roomId, to, description }
    // ----------------------------------------------

    socket.on("rtc:answer", (data) => {
        if (!validDescription(data?.description, "answer")) {
            console.log("Invalid WebRTC answer from", socket.id);
            return;
        }

        relayWebRTC(socket, "rtc:answer", data, {
            description: data.description
        });
    });

    // ----------------------------------------------
    // ICE CANDIDATE
    // Payload: { roomId, to, candidate }
    // ----------------------------------------------

    socket.on("rtc:ice-candidate", (data) => {
        if (!validIceCandidate(data?.candidate)) {
            console.log("Invalid ICE candidate from", socket.id);
            return;
        }

        relayWebRTC(socket, "rtc:ice-candidate", data, {
            candidate: data.candidate
        });
    });

    // ----------------------------------------------
    // DISCONNECT
    // ----------------------------------------------

    socket.on("disconnect", (reason) => {
        leaveRoom(socket);

        console.log(
            `Client disconnected: ${socket.id}. Reason: ${reason}`
        );
    });
});

// --------------------------------------------------
// ERROR HANDLING (must be registered after all routes)
// --------------------------------------------------

app.use(errorHandler);

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

// Only listen when run directly (node server.js) so tests can import
// the app/server/io without opening port 4000.
if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`ProxiSpeak backend running on port ${PORT}`);

        console.log(
            "Socket.IO authentication: " +
            (config.authEnabled
                ? "ENABLED"
                : "DISABLED (anonymous sockets allowed)")
        );

        checkConnection().then((ok) => {
            console.log(
                ok
                    ? "MySQL connection OK"
                    : "MySQL is NOT reachable - auth endpoints will return " +
                      "503 until the database settings in .env are fixed"
            );
        });
    });
}

module.exports = { app, server, io, rooms, socketRooms };
