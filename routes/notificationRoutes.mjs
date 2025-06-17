import { Router } from "express";
import * as notificationController from "../controllers/notificationController.mjs";
import { controllerWrapper } from "../controllers/index.mjs";
import { verifyAccessToken, verifyAdminAccessToken } from "../middlewares/auth.mjs";

const router = Router();

// APP PROTECTED ROUTES
router.post("/save-push-token", verifyAccessToken,controllerWrapper(notificationController.savePushToken, { logRequest: true, logResponse: true }));
router.get("/get-user-fcm-token", verifyAccessToken, controllerWrapper(notificationController.getUserFcmToken, { logRequest: true, logResponse: true }));
router.post("/send-push-notification",  controllerWrapper(notificationController.sendPushNotification, { logRequest: true, logResponse: true }));

// ADMIN PROTECTED ROUTES
// IMPLEMENTED
router.post("/broadcast-push-notification", verifyAdminAccessToken, controllerWrapper(notificationController.broadcastPushNotification, { logRequest: true, logResponse: true }));
// NOT IMPLEMENTED
router.post("/send-email", verifyAdminAccessToken, controllerWrapper(notificationController.sendEmail, { logRequest: true, logResponse: true }));
// NOT IMPLEMENTED
router.post("/broadcast-email", verifyAdminAccessToken, controllerWrapper(notificationController.broadcastEmail, { logRequest: true, logResponse: true }));

export default router;