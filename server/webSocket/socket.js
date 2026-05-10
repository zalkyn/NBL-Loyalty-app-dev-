import { Server } from "socket.io";

let io;

export const initSocket = (httpServer) => {
    const allowedOrigins = process.env.CLIENT_URL
        ? process.env.CLIENT_URL.split(",").map((url) => url.trim())
        : ["http://localhost:3000"];

    io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                // origin না থাকলে (same-origin বা server-to-server) allow করো
                if (!origin) return callback(null, true);

                if (allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    console.warn(`🚫 CORS blocked: ${origin}`);
                    callback(new Error("Not allowed by CORS"));
                }
            },
            methods: ["GET", "POST"],
            credentials: true,
        },
    });

    io.on("connection", (socket) => {
        console.log(`🟢 New socket connected: ${socket.id}`);

        // ── Customer ID Validation ──────────────────────────
        const customerId = socket.handshake.query.customerId;

        if (
            !customerId ||
            typeof customerId !== "string" ||
            !/^\d+$/.test(customerId) || // Shopify customer ID সবসময় numeric
            customerId.length > 20
        ) {
            console.warn(`⚠️ Invalid customerId, disconnecting: ${socket.id}`);
            socket.disconnect(true);
            return;
        }

        // ── Room Join ───────────────────────────────────────
        const room = `cust_${customerId}`;
        socket.join(room);
        console.log(`📦 Customer ${customerId} joined room: ${room}`);

        // ── Events ─────────────────────────────────────────
        socket.on("ping_server", () => {
            socket.emit("pong_server", { time: Date.now() });
        });

        socket.on("error", (err) => {
            console.error(`❌ Socket error [${socket.id}]:`, err.message);
        });

        socket.on("disconnect", (reason) => {
            console.log(`🔴 Disconnected: ${socket.id} | Reason: ${reason}`);
        });
    });

    // ── Server-level Error ──────────────────────────────
    io.engine.on("connection_error", (err) => {
        console.error("🔥 Socket.IO connection error:", err.message);
    });

    console.log("✅ Socket.IO initialized");
    return io;
};

export const getIO = () => {
    if (!io) throw new Error("Socket.IO not initialized. Call initSocket() first.");
    return io;
};