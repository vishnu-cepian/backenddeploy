import { Router } from "express";
import * as ratingController from "../controllers/ratingController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.post("/updateVendorRating", verifyAccessToken, controllerWrapper(ratingController.updateVendorRating, { logRequest: true, logResponse: true })); // Update vendor rating
router.get("/getDailyLeadershipBoard", controllerWrapper(ratingController.getDailyLeadershipBoard, { logRequest: true, logResponse: true })); // Get daily leadership board

export default router;