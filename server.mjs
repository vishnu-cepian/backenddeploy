import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";
// Import routes
import { AppDataSource } from "./utils/data-source.mjs";
import authRoutes from "./routes/authRoutes.mjs";
import { MESSAGE } from "./types/enums/index.mjs";
import { logger } from "./utils/logger-utils.mjs";
import { formatResponse } from "./utils/core-utils.mjs";
import protectedRoutes from "./routes/protectedRoutes.mjs";
import vendorRoutes from "./routes/vendorRoutes.mjs";


dotenv.config();

const app = express();

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

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
// protectedRoute(app); // Use the protected route middleware
app.use('/api/protected', protectedRoutes);
app.use("/api/vendor", vendorRoutes);
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
  
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});