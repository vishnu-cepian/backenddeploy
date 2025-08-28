import { Router } from "express";
import * as webhookServices from "../services/webhookService.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.post("/handleRazorpayPaymentWebhook", controllerWrapper(webhookServices.handleRazorpayPaymentWebhook, { logRequest: true, logResponse: true }));

router.post("/handleRazorpayPayoutWebhook", controllerWrapper(webhookServices.handleRazorpayPayoutWebhook, { logRequest: true, logResponse: true }));

export default router;