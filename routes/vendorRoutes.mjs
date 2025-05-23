import { Router } from "express";
import * as vendorController from "../controllers/vendorController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";

const router = Router();

router.get("/checkProfile", verifyAccessToken, vendorController.checkProfile); // Check if the user is a vendor
router.post("/completeProfile", verifyAccessToken, vendorController.completeProfile); // Complete vendor profile
router.get("/getVendorDetails/:vendorId", verifyAccessToken, vendorController.getVendorDetails); // Get vendor details
export default router;
