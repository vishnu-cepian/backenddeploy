import { Router } from "express";
import * as adminController from "../controllers/adminController.mjs";
import { verifyAdminAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

let logRequest = false
let logResponse = false

router.post("/login", controllerWrapper(adminController.login, { logRequest, logResponse }));
router.get("/test",verifyAdminAccessToken, controllerWrapper((req, res) => {
    res.status(200).json({ message: "Admin test route" });
}, { logRequest, logResponse }));

router.post("/refreshAccessToken", controllerWrapper(adminController.refreshAccessToken, { logRequest, logResponse }));

logRequest = true;
logResponse = true;

router.get("/stats",verifyAdminAccessToken, controllerWrapper(adminController.stats, {logRequest, logResponse}))

export default router;