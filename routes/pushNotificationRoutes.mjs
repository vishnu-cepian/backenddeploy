import { Router } from "express";
import * as pushNotificationController from "../controllers/pushNotificationController.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.post("/send-notification", controllerWrapper(pushNotificationController.sendNotification, { logRequest: true, logResponse: true }));

export default router;