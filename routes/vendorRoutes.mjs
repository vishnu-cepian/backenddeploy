import { Router } from "express";
import * as vendorController from "../controllers/vendorController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.get("/checkProfile", verifyAccessToken, controllerWrapper(vendorController.checkProfile, { logRequest: true, logResponse: true })); // Check if the user is a vendor
router.post("/completeProfile", verifyAccessToken, controllerWrapper(vendorController.completeProfile, { logRequest: true, logResponse: true })); // Complete vendor profile
router.get("/getVendorDetails/:vendorId", verifyAccessToken, controllerWrapper(vendorController.getVendorDetails, { logRequest: true, logResponse: true })); // Get vendor details
export default router;
