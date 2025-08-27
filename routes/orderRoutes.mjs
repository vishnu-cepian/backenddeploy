import { Router } from "express";
import * as orderController from "../controllers/orderController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

// CUSTOMER ACCESSIBLE ROUTES

router.post("/createOrder", verifyAccessToken, controllerWrapper(orderController.createOrder, { logRequest: true, logResponse: true }));

router.post("/sendOrderToVendor", verifyAccessToken, controllerWrapper(orderController.sendOrderToVendor, { logRequest: true, logResponse: true }));


// VENDOR ACCESSIBLE ROUTES

router.post("/vendorOrderResponse", verifyAccessToken, controllerWrapper(orderController.vendorOrderResponse, { logRequest: true, logResponse: true }));

router.post("/createRazorpayOrder", verifyAccessToken, controllerWrapper(orderController.createRazorpayOrder, { logRequest: true, logResponse: true }));

router.post("/updateOrderStatus", verifyAccessToken, controllerWrapper(orderController.updateOrderStatus, { logRequest: true, logResponse: true }));

// CUSTOMER & VENDOR ACCESSIBLE ROUTES

router.get("/getOrderTimeline/:orderId", verifyAccessToken, controllerWrapper(orderController.getOrderTimeline, { logRequest: true, logResponse: true }));

export default router;
