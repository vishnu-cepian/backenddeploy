import { Router } from "express";
// import * as deliveryController from "../controllers/deliveryController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";
import { handleDeliveryWebhook } from "../services/deliveryService.mjs";

const router = Router();

router.post("/handleDeliveryWebhook", handleDeliveryWebhook);

export default router;