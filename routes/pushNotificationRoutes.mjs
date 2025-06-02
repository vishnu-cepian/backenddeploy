import { Router } from "express";
import * as pushNotificationController from "../controllers/pushNotificationController.mjs";
import { controllerWrapper } from "../controllers/index.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";

const router = Router();
/*
    ADD JWT MIDDLEWARE

    - broadcast-notification for admin




*/
router.post("/save-push-token",verifyAccessToken,controllerWrapper(pushNotificationController.savePushToken, { logRequest: true, logResponse: true }));
router.post("/send-notification", controllerWrapper(pushNotificationController.sendNotification, { logRequest: true, logResponse: true }));
router.post("/broadcast-notification", controllerWrapper(pushNotificationController.broadcastNotification, { logRequest: true, logResponse: true }));

export default router;