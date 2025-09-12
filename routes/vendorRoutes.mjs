import { Router } from "express";
import * as vendorController from "../controllers/vendorController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.get("/checkProfile", verifyAccessToken, controllerWrapper(vendorController.checkProfile, { logRequest: true, logResponse: true })); 
router.post("/completeProfile", verifyAccessToken, controllerWrapper(vendorController.completeProfile, { logRequest: true, logResponse: true })); 
router.get("/getVendorDetails", verifyAccessToken, controllerWrapper(vendorController.getVendorDetails, { logRequest: true, logResponse: true })); 
router.patch("/saveVendorAvatarUrl", verifyAccessToken, controllerWrapper(vendorController.saveVendorAvatarUrl, { logRequest: true, logResponse: true })); 
router.get("/getVendorAvatarUrl", verifyAccessToken, controllerWrapper(vendorController.getVendorAvatarUrl, { logRequest: true, logResponse: true })); 
router.patch("/deleteVendorAvatarUrl", verifyAccessToken, controllerWrapper(vendorController.deleteVendorAvatarUrl, { logRequest: true, logResponse: true })); 
router.patch("/saveShopImageUrl", verifyAccessToken, controllerWrapper(vendorController.saveShopImageUrl, { logRequest: true, logResponse: true })); 
router.get("/getShopImageUrl", verifyAccessToken, controllerWrapper(vendorController.getShopImageUrl, { logRequest: true, logResponse: true })); 
router.patch("/deleteShopImageUrl", verifyAccessToken, controllerWrapper(vendorController.deleteShopImageUrl, { logRequest: true, logResponse: true })); 
router.post("/saveWorkImageUrl", verifyAccessToken, controllerWrapper(vendorController.saveWorkImageUrl, { logRequest: true, logResponse: true })); 
router.get("/getVendorWorkImages", verifyAccessToken, controllerWrapper(vendorController.getVendorWorkImages, { logRequest: true, logResponse: true })); 
router.delete("/deleteVendorWorkImage/:s3Key", verifyAccessToken, controllerWrapper(vendorController.deleteVendorWorkImage, { logRequest: true, logResponse: true })); 
router.get("/getVendorOrders/:page/:limit", verifyAccessToken, controllerWrapper(vendorController.getVendorOrders, { logRequest: true, logResponse: true}));
router.get("/getVendorOrderById/:orderVendorId", verifyAccessToken, controllerWrapper(vendorController.getVendorOrderById, { logRequest: true, logResponse: true}));
router.get("/getVendorQuote/:orderVendorId", verifyAccessToken, controllerWrapper(vendorController.getVendorQuote, { logRequest: true, logResponse: true}));
router.get("/getVendorStats", verifyAccessToken, controllerWrapper(vendorController.getVendorStats, { logRequest: true, logResponse: true}));
router.post("/addComplaint/:orderId", verifyAccessToken, controllerWrapper(vendorController.addComplaint, { logRequest: true, logResponse: true}));
router.get("/getVendorPayouts/:page/:limit", verifyAccessToken, controllerWrapper(vendorController.getVendorPayouts, { logRequest: true, logResponse: true}));
router.get("/getReviews/:page/:limit", verifyAccessToken, controllerWrapper(vendorController.getReviews, { logRequest: true, logResponse: true}));

export default router;
