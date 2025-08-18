import { Router } from "express";
import * as chatController from "../controllers/chatController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.post("/getOrCreateChatRoom/:receiverId", verifyAccessToken, controllerWrapper(chatController.getOrCreateChatRoom, { logRequest: true, logResponse: true }));
router.get("/getChatRoomsForUser", verifyAccessToken, controllerWrapper(chatController.getChatRoomsForUser, { logRequest: true, logResponse: true }));
router.get("/getMessages/:chatRoomId/:page/:limit", verifyAccessToken, controllerWrapper(chatController.getMessages, { logRequest: true, logResponse: true }));

export default router;