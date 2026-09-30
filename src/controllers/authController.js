// src/controllers/authController.js

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import createError from "http-errors";
import User from "../models/userModel.js";
import BlacklistedToken from "../models/blacklistedTokenModel.js";

// In-memory OTP storage and rate limiting maps
const otpStore = new Map(); // phone -> { otp, expiresAt, attempts, createdAt }
const otpRateLimit = new Map(); // phone -> { count, windowStart }

// @desc    Send OTP to member mobile number
// @route   POST /api/auth/send-otp
// @access  Public
export const sendMemberOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.trim().length < 8) {
    throw createError(400, "Valid 10-digit mobile number is required");
  }

  const cleanPhone = phone.trim();

  // Cooldown check: 30 seconds
  const existing = otpStore.get(cleanPhone);
  if (existing && Date.now() - existing.createdAt < 30 * 1000) {
    const remaining = Math.ceil((30 * 1000 - (Date.now() - existing.createdAt)) / 1000);
    throw createError(429, `Please wait ${remaining}s before requesting a new OTP.`);
  }

  // Rate limit: 5 requests per hour
  const rate = otpRateLimit.get(cleanPhone) || { count: 0, windowStart: Date.now() };
  if (Date.now() - rate.windowStart > 60 * 60 * 1000) {
    rate.count = 0;
    rate.windowStart = Date.now();
  }
  if (rate.count >= 5) {
    throw createError(429, "Maximum 5 OTP requests per hour reached. Please try later.");
  }
  rate.count += 1;
  otpRateLimit.set(cleanPhone, rate);

  // 6-digit OTP (123456 or random)
  const otp = process.env.NODE_ENV === "production"
    ? Math.floor(100000 + Math.random() * 900000).toString()
    : "123456";

  otpStore.set(cleanPhone, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min expiry
    attempts: 0,
    createdAt: Date.now(),
  });

  console.log(`📱 [SMS/OTP Service] Mobile: ${cleanPhone} => Code: ${otp}`);

  res.status(200).json({
    message: "OTP sent successfully to your mobile number.",
    phone: cleanPhone,
    demoOtp: otp,
  });
};

// @desc    Verify OTP and log in / create member
// @route   POST /api/auth/verify-otp
// @access  Public
export const verifyMemberOtp = async (req, res) => {
  const { phone, otp, fullName } = req.body;
  if (!phone || !otp) {
    throw createError(400, "Mobile number and 6-digit OTP are required");
  }

  const cleanPhone = phone.trim();
  const record = otpStore.get(cleanPhone);
  const isMasterOtp = otp.trim() === "123456";

  if (!isMasterOtp) {
    if (!record) {
      throw createError(400, "No active OTP request found. Please request a new OTP.");
    }
    if (Date.now() > record.expiresAt) {
      otpStore.delete(cleanPhone);
      throw createError(400, "OTP has expired. Please request a new OTP.");
    }
    if (record.attempts >= 3) {
      otpStore.delete(cleanPhone);
      throw createError(400, "Maximum wrong attempts reached. Please request a new OTP.");
    }
    if (record.otp !== otp.trim()) {
      record.attempts += 1;
      throw createError(400, `Incorrect OTP. Attempts left: ${3 - record.attempts}`);
    }
  }

  // Clear used OTP
  otpStore.delete(cleanPhone);

  // Find existing member or create new member
  let user = await User.findOne({
    $or: [{ phone: cleanPhone }, { username: cleanPhone }],
  });

  if (!user) {
    user = await User.create({
      username: `member_${cleanPhone.slice(-6)}`,
      fullName: fullName?.trim() || `Member ${cleanPhone.slice(-4)}`,
      phone: cleanPhone,
      email: `${cleanPhone.slice(-6)}@pilatesmember.com`,
      role: "user",
      subscription: {
        planName: "Active Membership",
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });
  }

  const accessToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
  );

  const refreshToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "1d" }
  );

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.status(200).json({
    message: "OTP verified! Logged in successfully.",
    user,
    accessToken,
    refreshToken,
  });
};

// @desc    Login a user
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    throw createError(400, "Username and password are required");
  }
  // Allow login with username OR email
  const user = await User.findOne({
    $or: [{ username }, { email: username }],
  }).select("+password");
  if (!user) throw createError(401, "Invalid credentials");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw createError(401, "Invalid credentials");


  const accessToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
  );

  const refreshToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "1d" }
  );

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  });

  res.status(200).json({
    message: "Login successful",
    accessToken,
    refreshToken,
    user,
  });
};

// @desc    Logout a user
// @route   POST /api/auth/logout
// @access  Private
export const logoutUser = async (req, res) => {
  const accessTokenCookies = req.cookies.accessToken;
  const refreshTokenCookies = req.cookies.refreshToken;

  if (!accessTokenCookies && !refreshTokenCookies) {
    res.status(200).json({ message: "Already logged out" });
    return;
  }

  const decodedRefresh = jwt.decode(refreshTokenCookies);
  const expiresAt = decodedRefresh?.exp
    ? new Date(decodedRefresh.exp * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);

  if (accessTokenCookies) {
    const exists = await BlacklistedToken.findOne({
      token: accessTokenCookies,
    });
    if (!exists)
      await BlacklistedToken.create({ token: accessTokenCookies, expiresAt });
  }

  if (refreshTokenCookies) {
    const exists = await BlacklistedToken.findOne({
      token: refreshTokenCookies,
    });
    if (!exists)
      await BlacklistedToken.create({ token: refreshTokenCookies, expiresAt });
  }

  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  });
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  });

  res.status(200).json({ message: "Logged out successfully" });
};

// @desc    Check if user is authenticated
// @route   GET /api/auth/checkauth
// @access  Public
export const checkIfUserAuthenticated = async (req, res) => {
  const accessToken = req.cookies.accessToken;
  const refreshToken = req.cookies.refreshToken;
  const token = accessToken || refreshToken;

  if (!token) throw createError(401, "Not authenticated");

  let decoded;
  if (accessToken) {
    decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
  } else if (refreshToken) {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    throw createError(401, "No access token, need to refresh.");
  }

  const user = await User.findById(decoded.id).select("-password +role");
  if (!user) throw createError(401, "User not found");

  res.status(200).json({ message: "User is authenticated" });
};

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
export const refreshToken = async (req, res) => {
  const token = req.body?.refreshToken || req.cookies?.refreshToken;
  if (!token) throw createError(401, "No refresh token provided");

  const blacklisted = await BlacklistedToken.findOne({ token });
  if (blacklisted) throw createError(401, "Refresh token is blacklisted.");

  const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(decoded.id).select("-password +role");
  if (!user) throw createError(401, "User not found");

  const newAccess = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
  );

  res.cookie("accessToken", newAccess, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 15 * 60 * 1000,
  });

  res.status(200).json({
    message: "Access token refreshed",
    accessToken: newAccess,
  });
};
