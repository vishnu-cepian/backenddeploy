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

export default router;
