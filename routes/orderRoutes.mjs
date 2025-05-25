import { Router } from "express";
import * as orderController from "../controllers/orderController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.post("/createOrder", verifyAccessToken, controllerWrapper(orderController.createOrder, { logRequest: true, logResponse: true }));
router.get("/getOrders", verifyAccessToken, controllerWrapper(orderController.getOrders, { logRequest: true, logResponse: true }));
router.get("/getOrderById/:orderId", verifyAccessToken, controllerWrapper(orderController.getOrderById, { logRequest: true, logResponse: true }));
// router.delete("/deleteOrder", verifyAccessToken, orderController.deleteOrder);

export default router;
