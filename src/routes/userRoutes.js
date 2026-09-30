import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import {
  createUser,
  getAllUsers,
  getAuthenticatedUserById,
  updateAuthenticatedUser,
  updateUser,
  deleteUser,
  getUserById,
  recordBodyStats,
  updateSubscription,
  markNotificationRead,
  deleteMyAccount,
} from "../controllers/userController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { authorizeRoles } from "../middlewares/roleMiddleware.js";

const router = Router();

// Public routes
router.post("/create", asyncHandler(createUser)); // Public - Create a new user (registration)

// User routes
router.get("/get", protect, asyncHandler(getAuthenticatedUserById)); // User - Get their own profile
router.put("/update", protect, asyncHandler(updateAuthenticatedUser)); // User - Update their own profile
router.delete("/account", protect, asyncHandler(deleteMyAccount)); // User - Self-service account deletion
router.put("/notifications/:id/read", protect, asyncHandler(markNotificationRead)); // User - Mark notification as read

// Admin, Trainer & Staff routes
router.post("/body-stats/:userId", protect, authorizeRoles("admin", "trainer", "staff"), asyncHandler(recordBodyStats)); // Record body stats
router.put("/subscription/:userId", protect, authorizeRoles("admin", "staff"), asyncHandler(updateSubscription)); // Set subscription plan & dates
router.get("/all", protect, authorizeRoles("admin", "staff"), asyncHandler(getAllUsers)); // Admin/Staff - Get all users
router.get("/:id", protect, authorizeRoles("admin", "staff"), asyncHandler(getUserById)); // Admin/Staff - Get a specific user by ID
router.put(
  "/update/:id",
  protect,
  authorizeRoles("admin", "staff"),
  asyncHandler(updateUser)
); // Admin/Staff - Update a specific user by ID
router.delete(
  "/delete/:id",
  protect,
  authorizeRoles("admin", "staff"),
  asyncHandler(deleteUser)
); // Admin/Staff - Delete a specific user by ID

export default router;
