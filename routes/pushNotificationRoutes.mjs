import { Router } from "express";
import * as pushNotificationController from "../controllers/pushNotificationController.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.post("/save-push-token", controllerWrapper(pushNotificationController.savePushToken, { logRequest: true, logResponse: true }));
router.post("/send-notification", controllerWrapper(pushNotificationController.sendNotification, { logRequest: true, logResponse: true }));
router.post("/broadcast-notification", controllerWrapper(pushNotificationController.broadcastNotification, { logRequest: true, logResponse: true }));

export default router;