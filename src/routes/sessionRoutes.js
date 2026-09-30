import { Router } from "express";
import {
  cancelSession,
  createSession,
  deleteSession,
  getAllSessionsForThisYearFromSelectedDate,
  getMyCompletedSessions,
  getMyUpcomingSessions,
  getPaginatedSessions,
  getSessionById,
  registerToSession,
  registerUserToSession,
  unregisterFromSession,
  unregisterUserFromSession,
  updateSession,
  joinWaitingList,
  leaveWaitingList,
  rescheduleSession,
  bulkCreateWeeklyClasses,
  createAndRegisterMemberToSession,
} from "../controllers/sessionController.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { protect } from "../middlewares/authMiddleware.js";
import { authorizeRoles } from "../middlewares/roleMiddleware.js";

const router = Router();

// Admin & Staff routes
router.post(
  "/create",
  protect,
  authorizeRoles("admin", "staff"),
  asyncHandler(createSession)
); // Admin/Staff - Create a new session
router.get(
  "/all",
  protect,
  authorizeRoles("admin", "staff"),
  asyncHandler(getPaginatedSessions)
); // Admin/Staff - Get all sessions
router.put(
  "/update/:id",
  protect,
  authorizeRoles("admin", "staff"),
  asyncHandler(updateSession)
); // Admin/Staff - Update a session by ID
router.delete(
  "/delete/:id",
  protect,
  authorizeRoles("admin"),
  asyncHandler(deleteSession)
); // Admin - Delete a session by ID
router.post(
  "/register/:sessionId/:username",
  protect,
  authorizeRoles("admin", "staff"),
  asyncHandler(registerUserToSession)
); // Admin/Staff - Register a user to a session
router.post(
  "/create-and-register/:sessionId",
  protect,
  authorizeRoles("admin", "staff"),
  asyncHandler(createAndRegisterMemberToSession)
); // Admin/Staff - Create new member and register directly to session
router.post(
  "/unregister/:sessionId/:userId",
  protect,
  authorizeRoles("admin", "staff"),
  asyncHandler(unregisterUserFromSession)
); // Admin/Staff - Unregister a user from a session
router.put(
  "/cancel/:id/",
  protect,
  authorizeRoles("admin", "staff"),
  asyncHandler(cancelSession)
); // Admin/Staff - Cancel a session by ID
router.post(
  "/bulk-create-week",
  protect,
  authorizeRoles("admin", "staff"),
  asyncHandler(bulkCreateWeeklyClasses)
); // Admin/Staff - Create 7 days of classes at once

// User routes
router.get("/my", protect, asyncHandler(getMyUpcomingSessions));
router.get("/myupcoming", protect, asyncHandler(getMyUpcomingSessions)); // User - Get all sessions the user registered to UPCOMING
router.get("/mycompleted", protect, asyncHandler(getMyCompletedSessions)); // User - Get all sessions the completed
// Public / Guest Route - browse class schedule
router.get(
  "/soon",
  asyncHandler(getAllSessionsForThisYearFromSelectedDate)
); // Public/Guest - gets all upcoming sessions for 7-day schedule browsing
router.post("/reschedule", protect, asyncHandler(rescheduleSession)); // User - Reschedule booking (max 2, up to 4 hrs before)
router.post("/waitlist/:id", protect, asyncHandler(joinWaitingList)); // User - Join waitlist
router.delete("/waitlist/:id", protect, asyncHandler(leaveWaitingList)); // User - Leave waitlist
router.get("/:id", protect, asyncHandler(getSessionById)); // User - View details of a specific session
router.post("/register/:id", protect, asyncHandler(registerToSession)); // User - Register to a session
router.post("/unregister/:id", protect, asyncHandler(unregisterFromSession)); // User - Unregister from a session

export default router;
