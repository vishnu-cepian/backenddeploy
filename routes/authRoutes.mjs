import { Router } from "express";
import * as authController from "../controllers/authController.mjs";
import { verifyAccessToken, verifyOtpToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

// REFER authContoller.mjs TO DETERMINE WHICH CALLS NEED AUTHORIZATION TOKEN

const logRequest = true;       // Making it true leads to credentials being logged in the console
const logResponse = true;

router.post("/signup",verifyOtpToken,controllerWrapper(authController.signup, { logRequest, logResponse }));  //The env has OTP_TOKEN_SECRET which will be handled by verifyOtpToken middleware to restrict bypassing the OTP

router.post("/login",controllerWrapper(authController.loginWithEmail, { logRequest, logResponse }));
router.get("/google-signin",controllerWrapper(authController.loginWithGoogle, { logRequest, logResponse }));

router.post("/checkEmail",controllerWrapper(authController.checkEmail, { logRequest, logResponse }));

router.post("/sendEmailOtp",controllerWrapper(authController.sendEmailOtp, { logRequest, logResponse }));
router.post("/verifyEmailOtp",controllerWrapper(authController.verifyEmailOtp, { logRequest, logResponse }));
router.post("/sendPhoneOtp",controllerWrapper(authController.sendPhoneOtp, { logRequest, logResponse }));           
router.post("/verifyPhoneOtp",controllerWrapper(authController.verifyPhoneOtp, { logRequest, logResponse }));        


// router.post("/forgotPassword",controllerWrapper(authController.forgotPassword, { logRequest, logResponse }));
router.post("/resetPassword",verifyOtpToken,controllerWrapper(authController.resetPassword, { logRequest, logResponse }));     // use PUT request

// router.post("/updatePassword",controllerWrapper(authController.updatePassword, { logRequest, logResponse }));
// router.post("/updateProfile",controllerWrapper(authController.updateProfile, { logRequest, logResponse }));
// router.post("/updateProfilePic",controllerWrapper(authController.updateProfilePic, { logRequest, logResponse }));
// router.post("/updateUser",controllerWrapper(authController.updateUser, { logRequest, logResponse }));
// router.post("/deleteUser",controllerWrapper(authController.deleteUser, { logRequest, logResponse }));
// router.post("/logout",controllerWrapper(authController.logout, { logRequest, logResponse }));
router.post("/refreshToken",controllerWrapper(authController.refreshToken, { logRequest, logResponse }));   // If refresh token expired. redirect user to login
// router.post("/verifyToken",controllerWrapper(authController.verifyToken, { logRequest, logResponse }));
// router.post("/verifyAccessToken",controllerWrapper(authController.verifyAccessToken, { logRequest, logResponse }));
// router.post("/verifyRefreshToken",controllerWrapper(authController.verifyRefreshToken, { logRequest, logResponse }));
router.post("/logout",controllerWrapper(authController.logout, { logRequest, logResponse }));   //REFRESH TOKEN IS NEEDED FOR LOGOUT
export default router;