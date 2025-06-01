import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";
import admin from "firebase-admin";
// Import routes
import { AppDataSource } from "./config/data-source.mjs";
import authRoutes from "./routes/authRoutes.mjs";
import { MESSAGE } from "./types/enums/index.mjs";
import { logger } from "./utils/logger-utils.mjs";
import { formatResponse } from "./utils/core-utils.mjs";
import vendorRoutes from "./routes/vendorRoutes.mjs";
import searchRoutes from "./routes/searchRoutes.mjs";
import orderRoutes from "./routes/orderRoutes.mjs";
import s3Routes from "./routes/s3routes.mjs";

dotenv.config();

admin.initializeApp({
  credential: admin.credential.cert({
    "type": process.env.FIREBASE_TYPE,
    "project_id": process.env.FIREBASE_PROJECT_ID,
    "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
    "private_key": process.env.FIREBASE_PRIVATE_KEY,
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
    "client_id": process.env.FIREBASE_CLIENT_ID,
    "auth_uri": process.env.FIREBASE_AUTH_URL,
    "token_uri": process.env.FIREBASE_TOKEN_URL,
    "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    "client_x509_cert_url": process.env.FIREBASE_CLIENT_X509_CERT_URL,
    "universe_domain": process.env.FIREBASE_UNIVERSE_DOMAIN

}),
});

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
app.use("/api/vendor", vendorRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/s3", s3Routes);

app.post("/api/send-notification", async (req, res) => {
  try {
    const { token, title, message } = req.body;
    if (!token || !title || !message) {
      throw new Error(formatError("Token, title, and message are required"));
    }
    const payload = {
      notification: {
      title,
      body: message,
    },
    token,
  };
    const response = await admin.messaging().send(payload);
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (error) {
    logger.error(error);
    res.status(500).json(formatResponse(MESSAGE.INTERNAL_SERVER_ERROR, false, error));
  }
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
  
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});