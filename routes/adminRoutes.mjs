import { Router } from "express";
import * as adminController from "../controllers/adminController.mjs";
import { verifyAdminAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

let logRequest = false
let logResponse = false

router.post("/login", controllerWrapper(adminController.login, { logRequest, logResponse }));
router.post("/refreshAccessToken", controllerWrapper(adminController.refreshAccessToken, { logRequest, logResponse }));

logRequest = true;
logResponse = true;

router.get("/stats",verifyAdminAccessToken, controllerWrapper(adminController.stats, {logRequest, logResponse}))
router.get("/getAllVendors",verifyAdminAccessToken, controllerWrapper(adminController.getAllVendors, {logRequest, logResponse}))
router.get("/getVendorById/:id",verifyAdminAccessToken, controllerWrapper(adminController.getVendorById, {logRequest, logResponse}))
router.post("/searchByEmailorPhoneNumber",verifyAdminAccessToken, controllerWrapper(adminController.searchByEmailorPhoneNumber, {logRequest, logResponse}))
router.post("/blockorUnblockVendor/:id",verifyAdminAccessToken, controllerWrapper(adminController.blockOrUnblockVendor, {logRequest, logResponse}))
router.post("/verifyVendor/:id",verifyAdminAccessToken, controllerWrapper(adminController.verifyVendor, {logRequest, logResponse}))
router.delete("/rejectVendor/:id",verifyAdminAccessToken, controllerWrapper(adminController.rejectVendor, {logRequest, logResponse}))
router.get("/getOrders",verifyAdminAccessToken, controllerWrapper(adminController.getOrders, {logRequest, logResponse}))
router.get("/getAllCustomers",verifyAdminAccessToken, controllerWrapper(adminController.getAllCustomers, {logRequest, logResponse}))
router.post("/searchCustomerByEmailorPhoneNumber",verifyAdminAccessToken, controllerWrapper(adminController.searchCustomerByEmailorPhoneNumber, {logRequest, logResponse}))
router.get("/getCustomerById/:id",verifyAdminAccessToken, controllerWrapper(adminController.getCustomerById, {logRequest, logResponse}))
router.post("/blockOrUnblockCustomer/:id",verifyAdminAccessToken, controllerWrapper(adminController.blockOrUnblockCustomer, {logRequest, logResponse}))
router.get("/getOrderById/:id",verifyAdminAccessToken, controllerWrapper(adminController.getOrderById, {logRequest, logResponse}))
router.get("/getVendorResponse/:id",verifyAdminAccessToken, controllerWrapper(adminController.getVendorResponse, {logRequest, logResponse}))
router.get("/getQuotes/:id",verifyAdminAccessToken, controllerWrapper(adminController.getQuotes, {logRequest, logResponse}))
router.get("/getPayments/:id",verifyAdminAccessToken, controllerWrapper(adminController.getPayments, {logRequest, logResponse}))

export default router;