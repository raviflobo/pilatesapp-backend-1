import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import {
  loginUser,
  logoutUser,
  checkIfUserAuthenticated,
  refreshToken,
  sendMemberOtp,
  verifyMemberOtp,
} from "../controllers/authController.js";

const router = Router();

// Authentication Routes
router.post("/login", asyncHandler(loginUser)); // Password login for Staff and Super Admin
router.post("/send-otp", asyncHandler(sendMemberOtp)); // Send 6-digit OTP to Member mobile
router.post("/verify-otp", asyncHandler(verifyMemberOtp)); // Verify OTP and authenticate Member
router.post("/logout", asyncHandler(logoutUser)); // Logging out
router.get("/checkauth", asyncHandler(checkIfUserAuthenticated)); // Check auth status
router.post("/refresh", asyncHandler(refreshToken)); // Refresh token

export default router;
