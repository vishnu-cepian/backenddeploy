import { Router } from "express";
import * as chatController from "../controllers/chatController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

/*

    NOT TESTED



*/

router.post("/getOrCreateChatRoom", verifyAccessToken, controllerWrapper(chatController.getOrCreateChatRoom, { logRequest: true, logResponse: true }));
router.get("/getChatRoom", verifyAccessToken, controllerWrapper(chatController.getChatRoom, { logRequest: true, logResponse: true }));
router.get("/getChatRoomsForUser", verifyAccessToken, controllerWrapper(chatController.getChatRoomsForUser, { logRequest: true, logResponse: true }));
router.post("/sendMessage", verifyAccessToken, controllerWrapper(chatController.sendMessage, { logRequest: true, logResponse: true }));
router.post("/getMessages", verifyAccessToken, controllerWrapper(chatController.getMessages, { logRequest: true, logResponse: true }));
router.post("/markAsRead", verifyAccessToken, controllerWrapper(chatController.markAsRead, { logRequest: true, logResponse: true }));
export default router;