import { Router } from "express";
import * as adminController from "../controllers/adminController.mjs";
import { verifyAdminAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

let logRequest = false
let logResponse = false

router.post("/login", controllerWrapper(adminController.login, { logRequest, logResponse }));
router.post("/refreshAccessToken", controllerWrapper(adminController.refreshAccessToken, { logRequest, logResponse }));
router.patch("/logout", verifyAdminAccessToken, controllerWrapper(adminController.logout, { logRequest, logResponse }));

logRequest = true;
logResponse = true;

router.get("/stats",verifyAdminAccessToken, controllerWrapper(adminController.stats, {logRequest, logResponse}))
router.get("/getAllVendors",verifyAdminAccessToken, controllerWrapper(adminController.getAllVendors, {logRequest, logResponse}))
router.get("/getVendorById/:id",verifyAdminAccessToken, controllerWrapper(adminController.getVendorById, {logRequest, logResponse}))
router.post("/searchByEmailorPhoneNumber",verifyAdminAccessToken, controllerWrapper(adminController.searchByEmailorPhoneNumber, {logRequest, logResponse}))
router.post("/blockorUnblockVendor/:id",verifyAdminAccessToken, controllerWrapper(adminController.blockOrUnblockVendor, {logRequest, logResponse}))
router.post("/verifyVendor/:id",verifyAdminAccessToken, controllerWrapper(adminController.verifyVendor, {logRequest, logResponse}))
router.delete("/rejectVendor/:id",verifyAdminAccessToken, controllerWrapper(adminController.rejectVendor, {logRequest, logResponse}))
router.patch("/updateVendor/:id",verifyAdminAccessToken, controllerWrapper(adminController.updateVendor, {logRequest, logResponse}))
router.get("/getOrders",verifyAdminAccessToken, controllerWrapper(adminController.getOrders, {logRequest, logResponse}))
router.get("/getAllCustomers",verifyAdminAccessToken, controllerWrapper(adminController.getAllCustomers, {logRequest, logResponse}))
router.post("/searchCustomerByEmailorPhoneNumber",verifyAdminAccessToken, controllerWrapper(adminController.searchCustomerByEmailorPhoneNumber, {logRequest, logResponse}))
router.get("/getCustomerById/:id",verifyAdminAccessToken, controllerWrapper(adminController.getCustomerById, {logRequest, logResponse}))
router.patch("/updateCustomer/:id",verifyAdminAccessToken, controllerWrapper(adminController.updateCustomer, {logRequest, logResponse}))
router.post("/blockOrUnblockCustomer/:id",verifyAdminAccessToken, controllerWrapper(adminController.blockOrUnblockCustomer, {logRequest, logResponse}))
router.get("/getOrderById/:id",verifyAdminAccessToken, controllerWrapper(adminController.getOrderById, {logRequest, logResponse}))
router.get("/getVendorResponse/:id",verifyAdminAccessToken, controllerWrapper(adminController.getVendorResponse, {logRequest, logResponse}))
router.get("/getQuotes/:id",verifyAdminAccessToken, controllerWrapper(adminController.getQuotes, {logRequest, logResponse}))
router.get("/getPayments/:id",verifyAdminAccessToken, controllerWrapper(adminController.getPayments, {logRequest, logResponse}))
router.get("/getOrderTimeline/:id",verifyAdminAccessToken, controllerWrapper(adminController.getOrderTimeline, {logRequest, logResponse}))
router.get("/getDeliveryDetails/:id",verifyAdminAccessToken, controllerWrapper(adminController.getDeliveryDetails, {logRequest, logResponse}))
router.get("/getOrSetSettings/:key",verifyAdminAccessToken, controllerWrapper(adminController.getOrSetSettings, {logRequest, logResponse}))
router.patch("/updateSettings",verifyAdminAccessToken, controllerWrapper(adminController.updateSettings, {logRequest, logResponse}))
router.get("/reports", verifyAdminAccessToken, controllerWrapper(adminController.reports, {logRequest, logResponse}))
router.get("/getComplaints", verifyAdminAccessToken, controllerWrapper(adminController.getComplaints, {logRequest, logResponse}))
router.patch("/resolveComplaint/:id", verifyAdminAccessToken, controllerWrapper(adminController.resolveComplaint, {logRequest, logResponse}))
router.get("/complaints/export", verifyAdminAccessToken, controllerWrapper(adminController.exportComplaints, {logRequest, logResponse}))
router.get("/loginHistory", verifyAdminAccessToken, controllerWrapper(adminController.loginHistory, {logRequest, logResponse}))
router.get("/getAdminActions", verifyAdminAccessToken, controllerWrapper(adminController.getAdminActions, {logRequest, logResponse}))
router.get("/getPaymentsList", verifyAdminAccessToken, controllerWrapper(adminController.getPaymentsList, {logRequest, logResponse}))
router.get("/getRefundsList", verifyAdminAccessToken, controllerWrapper(adminController.getRefundsList, {logRequest, logResponse}))
router.get("/getPaymentFailuresList", verifyAdminAccessToken, controllerWrapper(adminController.getPaymentFailuresList, {logRequest, logResponse}))
router.get("/getQueueLogs", verifyAdminAccessToken, controllerWrapper(adminController.getQueueLogs, {logRequest, logResponse}))
router.get("/getOutboxFailures", verifyAdminAccessToken, controllerWrapper(adminController.getOutboxFailures, {logRequest, logResponse}))
router.get("/getPayoutsList", verifyAdminAccessToken, controllerWrapper(adminController.getPayoutsList, {logRequest, logResponse}))
router.post("/processPayout", verifyAdminAccessToken, controllerWrapper(adminController.processPayout, {logRequest, logResponse}))
router.post("/retryPayout", verifyAdminAccessToken, controllerWrapper(adminController.retryPayout, {logRequest, logResponse}))
router.post("/cancelPayout", verifyAdminAccessToken, controllerWrapper(adminController.cancelPayout, {logRequest, logResponse}))

export default router;