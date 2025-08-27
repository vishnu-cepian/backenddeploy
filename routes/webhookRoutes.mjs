import { Router } from "express";
import * as webhookServices from "../services/webhookService.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.post("/handleRazorpayWebhook", controllerWrapper(webhookServices.handleRazorpayWebhook, { logRequest: true, logResponse: true }));

export default router;