import { Router } from "express";
import * as vendorController from "../controllers/vendorController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.get("/checkProfile", verifyAccessToken, controllerWrapper(vendorController.checkProfile, { logRequest: true, logResponse: true })); // Check if the user is a vendor
router.post("/completeProfile", verifyAccessToken, controllerWrapper(vendorController.completeProfile, { logRequest: true, logResponse: true })); // Complete vendor profile
router.get("/getVendorDetails", verifyAccessToken, controllerWrapper(vendorController.getVendorDetails, { logRequest: true, logResponse: true })); // Get vendor details
router.post("/saveVendorAvatarUrl", verifyAccessToken, controllerWrapper(vendorController.saveVendorAvatarUrl, { logRequest: true, logResponse: true })); // Save vendor avatar url
router.get("/getVendorAvatarUrl", verifyAccessToken, controllerWrapper(vendorController.getVendorAvatarUrl, { logRequest: true, logResponse: true })); // Get vendor avatar url
router.post("/deleteVendorAvatarUrl", verifyAccessToken, controllerWrapper(vendorController.deleteVendorAvatarUrl, { logRequest: true, logResponse: true })); // Delete vendor avatar url
router.post("/saveShopImageUrl", verifyAccessToken, controllerWrapper(vendorController.saveShopImageUrl, { logRequest: true, logResponse: true })); // Save shop image url
router.get("/getShopImageUrl", verifyAccessToken, controllerWrapper(vendorController.getShopImageUrl, { logRequest: true, logResponse: true })); // Get shop image url
router.post("/deleteShopImageUrl", verifyAccessToken, controllerWrapper(vendorController.deleteShopImageUrl, { logRequest: true, logResponse: true })); // Delete shop image url
router.post("/saveWorkImageUrl", verifyAccessToken, controllerWrapper(vendorController.saveWorkImageUrl, { logRequest: true, logResponse: true })); // Save work image url
router.get("/getVendorWorkImages", verifyAccessToken, controllerWrapper(vendorController.getVendorWorkImages, { logRequest: true, logResponse: true })); // Get vendor work images
router.post("/deleteVendorWorkImage", verifyAccessToken, controllerWrapper(vendorController.deleteVendorWorkImage, { logRequest: true, logResponse: true })); // Delete vendor work image

export default router;
