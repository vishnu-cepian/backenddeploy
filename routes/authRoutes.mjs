import { Router } from "express";
import * as authController from "../controllers/authController.mjs";
import { verifyAccessToken } from "../middlewares/auth.mjs";

const router = Router();

// REFER authContoller.mjs TO DETERMINE WHICH CALLS NEED AUTHORIZATION TOKEN

router.post("/signup",authController.signup);  //response will be in the format of {message: "success", status: true, data: {}}

router.post("/login",authController.loginWithEmail);
router.post("/google-signin",authController.loginWithGoogle);

router.post("/checkEmail",authController.checkEmail);

router.post("/sendEmailOtp",authController.sendEmailOtp);
router.post("/verifyEmailOtp",authController.verifyEmailOtp);
router.post("/sendPhoneOtp",verifyAccessToken,authController.sendPhoneOtp);            //vendor otp route
router.post("/verifyPhoneOtp",verifyAccessToken,authController.verifyPhoneOtp);        //vendor otp route


router.post("/forgotPassword",authController.forgotPassword);
router.post("/resetPassword",authController.resetPassword);

// router.post("/updatePassword",authController.updatePassword);
// router.post("/updateProfile",authController.updateProfile);
// router.post("/updateProfilePic",authController.updateProfilePic);
// router.post("/updateUser",authController.updateUser);
// router.post("/deleteUser",authController.deleteUser);
// router.post("/logout",authController.logout);
router.post("/refreshToken",authController.refreshToken);   // If refresh token expired. redirect user to login
// router.post("/verifyToken",authController.verifyToken);
// router.post("/verifyAccessToken",authController.verifyAccessToken);
// router.post("/verifyRefreshToken",authController.verifyRefreshToken);
router.post("/logout",authController.logout);   //REFRESH TOKEN IS NEEDED FOR LOGOUT
export default router;