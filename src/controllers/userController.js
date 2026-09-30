// src/controllers/userController.js

import bcrypt from "bcryptjs";
import createError from "http-errors";
import User from "../models/userModel.js";

// @desc    Create a new user
// @route   POST /api/users/create
// @access  Public
export const createUser = async (req, res) => {
  const { username, fullName, email, password, birthDate, gender, phone, subscription, role } = req.body;
  if (!fullName || (!username && !phone && !email)) {
    throw createError(400, "Full Name and Phone or Email are required");
  }
  const cleanPhone = phone ? String(phone).trim() : "";
  const cleanEmail = email ? String(email).toLowerCase().trim() : "";
  const finalUsername = (username ? String(username).trim() : (cleanPhone || cleanEmail.split("@")[0])).toLowerCase();

  if (cleanEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) throw createError(400, "Invalid email format");
    const emailExists = await User.findOne({ email: cleanEmail });
    if (emailExists) throw createError(400, "User with this email already exists");
  }
  if (cleanPhone) {
    const phoneExists = await User.findOne({ phone: cleanPhone });
    if (phoneExists) throw createError(400, "User with this phone number already exists");
  }
  const userExists = await User.findOne({ username: finalUsername });
  if (userExists) {
    throw createError(400, "Username already exists");
  }

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password || "Member123!", salt);
  const user = await User.create({
    username: finalUsername,
    fullName: fullName.trim(),
    email: cleanEmail || `${finalUsername}@pilates.com`,
    phone: cleanPhone,
    password: hash,
    birthDate: birthDate ? new Date(birthDate) : new Date("1995-01-01"),
    gender: gender || "female",
    role: role || "user",
    subscription: subscription || {
      planName: "Active Membership",
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isActive: true,
    },
  });
  res.status(201).json({ message: "Member created successfully!", user });
};

// @desc    Get all users
// @route   GET /api/users/all
// @access  Private/Admin
export const getAllUsers = async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 10;
  const search = req.query.search || "";
  const sortField = req.query.sortField || "username";
  const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
  const skip = (page - 1) * limit;

  if (page < 1 || limit < 1 || limit > 500) {
    throw createError(400, "Invalid pagination parameters");
  }

  // Free text search
  const filter = {
    $or: [
      { username: { $regex: search, $options: "i" } },
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { gender: { $regex: search, $options: "i" } },
      { role: { $regex: search, $options: "i" } },
    ],
  };

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("-password")
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  res.status(200).json({
    users,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
};

// @desc    Get authenticated user by ID
// @route   GET /api/users/get
// @access  Private
export const getAuthenticatedUserById = async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) throw createError(404, "User not found");
  res.json(user);
};

// @desc    Get a user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
export const getUserById = async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");
  if (!user) throw createError(404, "User not found");
  res.json(user);
};

// @desc    Update a user by ID
// @route   PUT /api/users/update/:id
// @access  Private/Admin
export const updateUser = async (req, res) => {
  /* ---------- ❶ locate user ---------- */
  const user = await User.findById(req.params.id);
  if (!user) throw createError(404, "User not found");

  /* ---------- ❷ sanitise payload ---------- */
  // Never allow password changes through this endpoint
  if ("password" in req.body) delete req.body.password;

  // Normalise e-mail & username casing/spacing
  if (req.body.email) req.body.email = req.body.email.toLowerCase().trim();
  if (req.body.username) req.body.username = req.body.username.trim();

  // Convert birthDate if a string (HTML `<input type="date">` comes as “YYYY-MM-DD”)
  if (req.body.birthDate !== undefined) {
    req.body.birthDate = new Date(req.body.birthDate);
  }

  // Ensure role & gender values are legal (optional but nice-to-have)
  const allowedRoles = ["user", "admin", "staff", "trainer"];
  const allowedGenders = ["male", "female", "other"];
  if (req.body.role && !allowedRoles.includes(req.body.role))
    throw createError(400, "Invalid role value");
  if (req.body.gender && !allowedGenders.includes(req.body.gender))
    throw createError(400, "Invalid gender value");

  /* ---------- ❸ apply & persist ---------- */
  Object.assign(user, req.body);
  await user.save();

  // Re-fetch WITHOUT the password field and send back to client
  const updated = await User.findById(user._id).select("-password");

  res.status(200).json({
    message: "User updated successfully",
    user: updated,
  });
};

// @desc    Update authenticated user
// @route   PUT /api/users/update
// @access  Private
export const updateAuthenticatedUser = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw createError(404, "User not found");
  Object.assign(user, req.body);
  const updated = await user.save();
  res.json(updated);
};

// @desc    Delete a user by ID
// @route   DELETE /api/users/delete/:id
// @access  Private/Admin
export const deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw createError(404, "User not found");
  await user.deleteOne();
  res.json({ message: "User deleted successfully" });
};

// @desc    Self-service account deletion (App Store requirement)
// @route   DELETE /api/users/account
// @access  Private
export const deleteMyAccount = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw createError(404, "User not found");
  await user.deleteOne();
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
  res.json({ message: "Account deleted successfully" });
};

// @desc    Add body stats entry (Trainers & Admins)
// @route   POST /api/users/body-stats/:userId
// @access  Private/Admin
export const recordBodyStats = async (req, res) => {
  const { userId } = req.params;
  const { weight, height, bodyFat, chest, waist, hips, arms, thighs, note, recordedBy } = req.body;

  const user = await User.findById(userId);
  if (!user) throw createError(404, "User not found");

  const hMeters = Number(height) > 0 ? Number(height) / 100 : null;
  const bmi = hMeters && Number(weight) > 0 ? Number((Number(weight) / (hMeters * hMeters)).toFixed(1)) : null;

  const statsEntry = {
    date: new Date(),
    weight: weight ? Number(weight) : null,
    height: height ? Number(height) : null,
    bmi,
    bodyFat: bodyFat ? Number(bodyFat) : null,
    chest: chest ? Number(chest) : null,
    waist: waist ? Number(waist) : null,
    hips: hips ? Number(hips) : null,
    arms: arms ? Number(arms) : null,
    thighs: thighs ? Number(thighs) : null,
    note: note || "",
    recordedBy: recordedBy || req.user.username || "Trainer",
  };

  user.bodyStats.push(statsEntry);
  await user.save();

  // Notify member
  user.notifications.push({
    title: "New Body Stats Recorded",
    message: `Your trainer updated your body stats (Weight: ${weight || "-"}kg, BMI: ${bmi || "-"}).`,
    date: new Date(),
    read: false,
    type: "stats",
  });
  await user.save();

  res.status(201).json({ message: "Body stats recorded successfully", bodyStats: user.bodyStats });
};

// @desc    Update subscription (Super Admin)
// @route   PUT /api/users/subscription/:userId
// @access  Private/Admin
export const updateSubscription = async (req, res) => {
  const { userId } = req.params;
  const { planName, startDate, endDate, isActive } = req.body;

  const user = await User.findById(userId);
  if (!user) throw createError(404, "User not found");

  user.subscription = {
    planName: planName || user.subscription?.planName || "Monthly Membership",
    startDate: startDate ? new Date(startDate) : (user.subscription?.startDate || new Date()),
    endDate: endDate ? new Date(endDate) : user.subscription?.endDate,
    isActive: isActive !== undefined ? Boolean(isActive) : true,
  };

  // Add notification
  user.notifications.push({
    title: "Subscription Updated",
    message: `Your membership has been set to "${user.subscription.planName}". Valid until ${new Date(user.subscription.endDate).toLocaleDateString()}.`,
    date: new Date(),
    read: false,
    type: "subscription",
  });

  await user.save();

  res.json({ message: "Subscription updated successfully", subscription: user.subscription });
};

// @desc    Mark notification as read
// @route   PUT /api/users/notifications/:id/read
// @access  Private
export const markNotificationRead = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw createError(404, "User not found");

  const notif = user.notifications.id(req.params.id);
  if (notif) {
    notif.read = true;
    await user.save();
  }
  res.json({ message: "Notification marked as read" });
};

