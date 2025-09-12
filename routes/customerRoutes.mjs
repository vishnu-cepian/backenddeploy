import { Router } from "express";
import * as customerController from "../controllers/customerController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.post("/addCustomerAddress", verifyAccessToken, controllerWrapper(customerController.addCustomerAddress, { logRequest: true, logResponse: true }));
router.get("/getCustomerAddresses", verifyAccessToken, controllerWrapper(customerController.getCustomerAddresses, { logRequest: true, logResponse: true }));
router.patch("/updateCustomerAddress", verifyAccessToken, controllerWrapper(customerController.updateCustomerAddress, { logRequest: true, logResponse: true }));
router.patch("/deleteCustomerAddress/:addressId", verifyAccessToken, controllerWrapper(customerController.deleteCustomerAddress, { logRequest: true, logResponse: true }));
router.patch("/makeAddressDefault/:addressId", verifyAccessToken, controllerWrapper(customerController.makeAddressDefault, { logRequest: true, logResponse: true }));
router.get("/getVendorDetailsByVendorId/:vendorId", verifyAccessToken, controllerWrapper(customerController.getVendorDetailsByVendorId, { logRequest: true, logResponse: true }));
router.get("/getVendorWorkImagesByVendorId/:vendorId", verifyAccessToken, controllerWrapper(customerController.getVendorWorkImagesByVendorId, { logRequest: true, logResponse: true }));
router.get("/getOrders/:page/:limit", verifyAccessToken, controllerWrapper(customerController.getOrders, { logRequest: true, logResponse: true }));
router.get("/getOrderById/:orderId", verifyAccessToken, controllerWrapper(customerController.getOrderById, { logRequest: true, logResponse: true }));
router.get("/getOrdersWithOrderRequests/:page/:limit", verifyAccessToken, controllerWrapper(customerController.getOrdersWithOrderRequests, { logRequest: true, logResponse: true }));
router.get("/getOrderRequests/:orderId", verifyAccessToken, controllerWrapper(customerController.getOrderRequests, { logRequest: true, logResponse: true }));
router.get("/getAcceptedQuoteById/:orderVendorId", verifyAccessToken, controllerWrapper(customerController.getAcceptedQuoteById, { logRequest: true, logResponse: true }));
router.post("/addComplaint/:orderId", verifyAccessToken, controllerWrapper(customerController.addComplaint, { logRequest: true, logResponse: true }));
router.get("/getCustomerPayments/:page/:limit", verifyAccessToken, controllerWrapper(customerController.getCustomerPayments, { logRequest: true, logResponse: true }));

export default router;
