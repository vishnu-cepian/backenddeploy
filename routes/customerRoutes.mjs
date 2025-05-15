import { Router } from "express";

const router = Router();
// use :userId to quickly and dynamically get profiles of vendor
// router.get("/check-profile/:userId", verifyAccessToken, customerrController.checkProfile); // Check if the user is a vendor

export default router;