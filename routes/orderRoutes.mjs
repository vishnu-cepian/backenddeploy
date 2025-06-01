import { Router } from "express";
import * as orderController from "../controllers/orderController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

// CUSTOMER ACCESSIBLE ROUTES

router.post("/createOrder", verifyAccessToken, controllerWrapper(orderController.createOrder, { logRequest: true, logResponse: true }));
router.get("/getOrders", verifyAccessToken, controllerWrapper(orderController.getOrders, { logRequest: true, logResponse: true }));
router.get("/getOrderById/:orderId", verifyAccessToken, controllerWrapper(orderController.getOrderById, { logRequest: true, logResponse: true }));
router.delete("/deleteOrder/:orderId", verifyAccessToken, controllerWrapper(orderController.deleteOrder, { logRequest: true, logResponse: true }));

router.post("/sendOrderToVendor/:orderId/:customerId", verifyAccessToken, controllerWrapper(orderController.sendOrderToVendor, { logRequest: true, logResponse: true }));

router.get("/viewOrderVendorStatus/:orderId", verifyAccessToken, controllerWrapper(orderController.viewOrderVendorStatus, { logRequest: true, logResponse: true }));
router.get("/viewAcceptedOrderDetails/:orderId/:vendorId", verifyAccessToken, controllerWrapper(orderController.viewAcceptedOrderDetails, { logRequest: true, logResponse: true }));

// VENDOR ACCESSIBLE ROUTES

router.get("/viewReceivedOrderDetails/:vendorId", verifyAccessToken, controllerWrapper(orderController.viewReceivedOrderDetails, { logRequest: true, logResponse: true }));
router.post("/vendorOrderResponse/:orderId/:vendorId", verifyAccessToken, controllerWrapper(orderController.vendorOrderResponse, { logRequest: true, logResponse: true }));

// PAYMENT ROUTES

router.post("/initiateVendorPayment/:orderId/:vendorId/:customerId", verifyAccessToken, controllerWrapper(orderController.initiateVendorPayment, { logRequest: true, logResponse: true }));
router.post("/confirmVendorPayment/:paymentId", verifyAccessToken, controllerWrapper(orderController.confirmVendorPayment, { logRequest: true, logResponse: true }));

export default router;
