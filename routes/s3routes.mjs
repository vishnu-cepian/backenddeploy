import { Router } from "express";
import * as s3Controller from "../controllers/s3controller.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.post("/s3-presigned-url", controllerWrapper(s3Controller.getPresignedUrl, { logRequest: true, logResponse: true }));
router.post("/s3-presigned-view-url", controllerWrapper(s3Controller.getPresignedViewUrl, { logRequest: true, logResponse: true }));

export default router;