import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";
dotenv.config();
import { createServer } from "http";
import { Server } from "socket.io";
import os from "os";
// import cron
import "./jobs/expirePendingVendors.mjs"

// Import routes
import authRoutes from "./routes/authRoutes.mjs";
import vendorRoutes from "./routes/vendorRoutes.mjs";
import searchRoutes from "./routes/searchRoutes.mjs";
import orderRoutes from "./routes/orderRoutes.mjs";
import s3Routes from "./routes/s3routes.mjs";
import pushNotification from "./routes/pushNotificationRoutes.mjs"
import chatRoutes from "./routes/chatRoutes.mjs"
import adminRoutes from "./routes/adminRoutes.mjs"

// Import Utils and config files
import { MESSAGE } from "./types/enums/index.mjs";
import { logger } from "./utils/logger-utils.mjs";
import { formatResponse } from "./utils/core-utils.mjs";
import { AppDataSource } from "./config/data-source.mjs";

import { initializeSocket } from "./sockets/index.mjs";

const app = express();

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: "GET, POST, PUT, DELETE, PATCH",
    allowedHeaders: "Content-Type, Authorization",
    credentials: true,
    optionsSuccessStatus: 200,
  },
  maxHttpBufferSize: 1e8, // 100MB
});

initializeSocket(io);

const corsOptions = {
  origin: "*",
  methods: "GET, POST, PUT, DELETE, PATCH",
  allowedHeaders: "Content-Type, Authorization",
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/s3", s3Routes);
app.use("/api/pushNotification", pushNotification)
app.use("/api/chat", chatRoutes)
app.use("/api/admin",adminRoutes)
app.get("/api/health", (req, res) => {
  res.json({
    env: process.env.NODE_ENV,
    message: "Server is running",
    status: "healthy",
    uptime: os.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
  });
});

app.use((err, req, res, next) => {
  logger.error(err.stack);

  const response = {
    message: err.message,
    status: err.status,
    data: err.data,
  };

  if (err && err.statusCode) {
    return res
      .status(err.statusCode)
      .json(formatResponse(response.message, response.status, response.data));
  }

  res
    .status(500)
    .json(formatResponse(MESSAGE.INTERNAL_SERVER_ERROR, false, response.data));
});

const PORT = process.env.PORT || 3000;

AppDataSource.initialize()
  .then(() => {
    console.log("Data Source has been initialized!");
  })
  .catch((err) => {
    console.error("Error during Data Source initialization", err);
  });
  
// app.listen(PORT, () => {
//   console.log(`Server running at http://localhost:${PORT}`);
// });

httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
