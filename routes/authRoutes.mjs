import { Router } from "express";
import * as authController from "../controllers/authController.mjs";
import { controllerWrapper } from "../controllers/index.mjs";
// import { authenticateAccessToken } from "../services/authService.mjs";

const router = Router();

// REFER authContoller.mjs TO DETERMINE WHICH CALLS NEED AUTHORIZATION TOKEN

router.post("/signup-customer",authController.signupCustomer);  //response will be in the format of {message: "success", status: true, data: {}}
router.post("/signup-vendor",authController.signupVendor);  //response will be in the format of {message: "success", status: true, data: {}}

router.post("/login",authController.loginWithEmail);
router.post("/google-signin",authController.loginWithGoogle);

router.post("/checkEmail",authController.checkEmail);
router.post("/sendOtp",authController.sendOtp);
router.post("/verifyOtp",authController.verifyOtp);

router.post("/forgotPassword",authController.forgotPassword);
router.post("/resetPassword",authController.resetPassword);

// router.post("/updatePassword",authController.updatePassword);
// router.post("/updateProfile",authController.updateProfile);
// router.post("/updateProfilePic",authController.updateProfilePic);
// router.post("/updateUser",authController.updateUser);
// router.post("/deleteUser",authController.deleteUser);
// router.post("/logout",authController.logout);
router.post("/refreshToken",authController.refreshToken);
// router.post("/verifyToken",authController.verifyToken);
// router.post("/verifyAccessToken",authController.verifyAccessToken);
// router.post("/verifyRefreshToken",authController.verifyRefreshToken);
router.post("/logout",authController.logout);   //REFRESH TOKEN IS NEEDED FOR LOGOUT
export default router;