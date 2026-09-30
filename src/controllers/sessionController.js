// src/controllers/sessionController.js

import createError from "http-errors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Session from "../models/sessionModel.js";
import User from "../models/userModel.js";
import { notifyParticipantsWhenSessionUpdates } from "../services/emailService.js";

// @desc    Create a new session
// @route   POST /api/sessions/create
// Helper to check for overlapping trainer schedules
const checkTrainerClash = async (trainerName, dateStr, timeStr, durationMinutes, excludeSessionId = null) => {
  if (!trainerName || !dateStr || !timeStr) return;

  const sessionDate = new Date(dateStr);
  const startOfDay = new Date(sessionDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(sessionDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const [h, m] = timeStr.split(":").map(Number);
  const newStartMinutes = h * 60 + m;
  const newEndMinutes = newStartMinutes + Number(durationMinutes || 55);

  const query = {
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $ne: "בוטל" },
    "trainer.name": trainerName,
  };
  if (excludeSessionId) {
    query._id = { $ne: excludeSessionId };
  }

  const existingSessions = await Session.find(query);

  for (const ses of existingSessions) {
    if (!ses.time) continue;
    const [eh, em] = ses.time.split(":").map(Number);
    const existingStart = eh * 60 + em;
    const existingEnd = existingStart + Number(ses.duration || 55);

    if (newStartMinutes < existingEnd && newEndMinutes > existingStart) {
      throw createError(
        400,
        `Trainer clash: ${trainerName} is already scheduled for another class at ${ses.time} (${ses.type})`
      );
    }
  }
};

// @desc    Create a new session
// @route   POST /api/sessions/create
// @access  Private/Admin
export const createSession = async (req, res) => {
  if (typeof req.body.trainer === "string") {
    req.body.trainer = {
      name: req.body.trainer,
      bio: "Certified Pilates Instructor",
      photo: "/RotemLogo.png",
    };
  } else if (req.body.trainerName) {
    req.body.trainer = {
      name: req.body.trainerName,
      bio: req.body.trainerBio || "Certified Pilates Instructor",
      photo: "/RotemLogo.png",
    };
  } else if (!req.body.trainer || !req.body.trainer.name) {
    req.body.trainer = {
      name: "Sarah Jenkins",
      bio: "Certified Classical Pilates Master",
      photo: "/RotemLogo.png",
    };
  }

  if (!req.body.location) req.body.location = "סטודיו";
  if (!req.body.description) {
    req.body.description = `Group ${req.body.type} session focusing on strength, posture, and core control.`;
  }

  if (
    !req.body.date ||
    !req.body.time ||
    !req.body.type ||
    !req.body.duration ||
    !req.body.maxParticipants
  ) {
    throw createError(400, "All fields are required");
  }
  if (req.body.maxParticipants <= 0) {
    throw createError(400, "Max participants must be greater than 0");
  }
  if (req.body.duration <= 0) {
    throw createError(400, "Duration must be greater than 0");
  }
  if (
    req.body.status &&
    !["מתוכנן", "בוטל", "הושלם"].includes(req.body.status)
  ) {
    throw createError(400, "Invalid status");
  }

  const selectedDateStr = new Date(req.body.date).toLocaleDateString("en-CA", {
    timeZone: "Asia/Jerusalem",
  });
  const todayJerusalemStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Jerusalem",
  });

  if (selectedDateStr < todayJerusalemStr) {
    throw createError(400, "Cannot create a session in the past");
  }

  // Trainer clash validation
  const trainerName = req.body.trainer?.name;
  if (trainerName) {
    await checkTrainerClash(trainerName, req.body.date, req.body.time, req.body.duration);
  }

  const session = await Session.create(req.body);
  res.status(201).json(session);
};

// @desc    Get all upcoming sessions for user
// @route   GET /api/sessions/myupcoming
// @access  Private
export const getMyUpcomingSessions = async (req, res) => {
  let sessions = await Session.find({ participants: req.user._id }).populate(
    "participants",
    "username email fullName"
  );

  sessions = sessions
    .filter((s) => s.status === "מתוכנן")
    .sort((a, b) => {
      const aDateTime = new Date(a.date);
      aDateTime.setHours(
        Number(a.time.split(":")[0]),
        Number(a.time.split(":")[1])
      );
      const bDateTime = new Date(b.date);
      bDateTime.setHours(
        Number(b.time.split(":")[0]),
        Number(b.time.split(":")[1])
      );
      return aDateTime - bDateTime;
    });

  res.json(sessions);
};

// @desc    Get all sessions the user is registered to
// @route   GET /api/sessions/mycompleted
// @access  Private
export const getMyCompletedSessions = async (req, res) => {
  let sessions = await Session.find({ participants: req.user._id }).populate(
    "participants",
    "username email fullName"
  );

  sessions = sessions
    .filter((s) => s.status === "הושלם")
    .sort((a, b) => {
      const aDateTime = new Date(a.date);
      aDateTime.setHours(
        Number(a.time.split(":")[0]),
        Number(a.time.split(":")[1])
      );
      const bDateTime = new Date(b.date);
      bDateTime.setHours(
        Number(b.time.split(":")[0]),
        Number(b.time.split(":")[1])
      );
      return aDateTime - bDateTime;
    });

  res.json(sessions);
};

// @desc    Get paginated sessions
// @route   GET /api/sessions/all
// @access  Private/Admin
export const getPaginatedSessions = async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 10;
  const search = req.query.search || "";
  const sortField = req.query.sortField || "date";
  const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
  const skip = (page - 1) * limit;

  if (page < 1 || limit < 1 || limit > 100) {
    throw createError(400, "Invalid pagination parameters");
  }

  // Free text search
  const filter = {
    $or: [
      { time: { $regex: search, $options: "i" } },
      { status: { $regex: search, $options: "i" } },
      { type: { $regex: search, $options: "i" } },
      { notes: { $regex: search, $options: "i" } },
      { location: { $regex: search, $options: "i" } },
    ],
  };

  const [sessions, total] = await Promise.all([
    Session.find(filter)
      .populate("participants", "id username email fullName")
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit),
    Session.countDocuments(filter),
  ]);

  res.status(200).json({
    sessions,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
};

// @desc    Get a session by ID
// @route   GET /api/sessions/:id
// @access  Private
export const getSessionById = async (req, res) => {
  const session = await Session.findById(req.params.id).populate(
    "participants",
    "username email"
  );
  if (!session) throw createError(404, "Session not found");
  res.json(session);
};

// @desc    Update a session by ID
// @route   PUT /api/sessions/update/:id
// @access  Private/Admin
export const updateSession = async (req, res) => {
  const session = await Session.findById(req.params.id);

  if (!session) throw createError(404, "Session not found");
  if (session.status === "בוטל" || session.status === "הושלם") {
    throw createError(400, "Cannot update a cancelled or completed session");
  }
  if (req.body.duration !== undefined) {
    req.body.duration = Number(req.body.duration);
  }
  if (req.body.maxParticipants !== undefined) {
    req.body.maxParticipants = Number(req.body.maxParticipants);
  }

  // Trainer clash validation
  const trainerName = req.body.trainer?.name || session.trainer?.name;
  const dateStr = req.body.date || session.date;
  const timeStr = req.body.time || session.time;
  const duration = req.body.duration || session.duration;
  if (trainerName) {
    await checkTrainerClash(trainerName, dateStr, timeStr, duration, session._id);
  }

  // Create a shallow copy for sending an email
  const oldSession = session.toObject();

  Object.assign(session, req.body);
  await session.save();
  const updated = await Session.findById(req.params.id)
    .populate("participants", "fullName username email")
    .exec();

  // Sending an email
  // On development - run docker-compose up --build to run the containers - server and worker(emails)
  // On production - currently on render - it doesn'w support background jobs, only in premium account
  // On the future - scale to AWS
  notifyParticipantsWhenSessionUpdates(oldSession, updated);

  res.status(200).json({
    message: "Session updated successfully",
    session: updated,
  });
};

// @desc    Delete a session by ID
// @route   DELETE /api/sessions/delete/:id
// @access  Private/Admin
export const deleteSession = async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) throw createError(404, "Session not found");
  await session.deleteOne();
  res.json({ message: "Session deleted successfully" });
};

// @desc    Cancel a session by ID
// @route   PUT /api/sessions/cancel/:id
// @access  Private/Admin
export const cancelSession = async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) throw createError(404, "Session not found");
  if (session.status === "בוטל")
    throw createError(400, "Session already cancelled");
  session.status = "בוטל";
  await session.save();
  res
    .status(200)
    .json({ message: "Session cancelled successfully", session: session });
};

// @desc    Register a user to a session
// @route   POST /api/sessions/register/:sessionId/:userId
// @access  Private
export const registerToSession = async (req, res) => {
  console.log("Registering user to session:", req.params.id);

  if (req.user && ["staff", "admin", "trainer"].includes(req.user.role)) {
    throw createError(
      403,
      "Staff members cannot book classes for themselves. Use 'Add Member' to register a member for this class."
    );
  }

  const session = await Session.findById(req.params.id);
  if (!session) throw createError(404, "Session not found");
  if (["הושלם", "בוטל"].includes(session.status))
    throw createError(
      400,
      "Cannot register to a completed or cancelled session"
    );
  if (session.participants.includes(req.user._id))
    throw createError(400, "Already registered to this session");
  if (session.participants.length >= session.maxParticipants)
    throw createError(400, "Session is full");
  session.participants.push(req.user._id);
  await session.save();
  res
    .status(200)
    .json({ message: "Registered successfully", session: session });
};

// @desc    Unregister a user from a session
// @route   POST /api/sessions/unregister/:id
// @access  Private
export const unregisterFromSession = async (req, res) => {
  let session = await Session.findById(req.params.id);
  if (!session) throw createError(404, "Session not found");
  session.participants = session.participants.filter(
    (id) => id.toString() !== req.user._id.toString()
  );
  await session.save();
  res
    .status(200)
    .json({ message: "Unregistered successfully", session: session });
};

// @desc    Get all sessions for the year of the selected date
// @route   GET /api/sessions/soon
// @access  Private
export const getAllSessionsForThisYearFromSelectedDate = async (req, res) => {
  const date = req.query.date ? new Date(req.query.date) : new Date();
  const year = isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  const start = new Date(`${year}-01-01T00:00:00Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00Z`);
  let sessions = await Session.find({
    date: { $gte: start, $lt: end },
  }).populate("participants", "username email");

  sessions = sessions.filter(
    (session) => session.status !== "הושלם" && session.status !== "בוטל"
  );
  res.json(sessions);
};

// @desc    Register a user to a session
// @route   GET /api/sessions/register/:sessionId/:username
// @access  Private/Admin
export const registerUserToSession = async (req, res) => {
  const { sessionId, username } = req.params;
  const userId = (await User.findOne({ username }).select("_id"))?._id;
  if (!userId) throw createError(404, "User not found");
  const session = await Session.findById(sessionId);
  if (!session) throw createError(404, "Session not found");
  if (["הושלם", "בוטל"].includes(session.status))
    throw createError(
      400,
      "Cannot register to a completed or cancelled session"
    );
  if (session.participants.includes(userId)) {
    throw createError(400, "User already registered to this session");
  }
  if (session.participants.length >= session.maxParticipants)
    throw createError(400, "Session is full");
  session.participants.push(userId);
  await session.save();
  await session.populate("participants", "fullName username email");

  res
    .status(200)
    .json({ message: "User registered successfully", session: session });
};

// @desc    Staff / Admin - Create a new member and register directly to session
// @route   POST /api/sessions/create-and-register/:sessionId
// @access  Private (Admin / Staff)
export const createAndRegisterMemberToSession = async (req, res) => {
  const { sessionId } = req.params;
  const { username, fullName, email, password, birthDate, gender } = req.body;

  if (!username || !fullName || !email) {
    throw createError(400, "Full Name, Username, and Email are required");
  }

  const session = await Session.findById(sessionId);
  if (!session) throw createError(404, "Session not found");

  if (["הושלם", "בוטל"].includes(session.status)) {
    throw createError(400, "Cannot register to a completed or cancelled session");
  }
  if (session.participants.length >= session.maxParticipants) {
    throw createError(400, "Session is full");
  }

  // Check if member already exists
  let member = await User.findOne({
    $or: [{ username: username.trim() }, { email: email.toLowerCase().trim() }],
  });

  if (!member) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password || "Member123!", salt);
    member = await User.create({
      username: username.trim(),
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: hash,
      birthDate: birthDate ? new Date(birthDate) : new Date("1995-01-01"),
      gender: gender || "female",
      role: "user",
      subscription: {
        planName: "Active Membership",
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });
  }

  if (session.participants.includes(member._id)) {
    throw createError(400, "Member is already registered to this session");
  }

  session.participants.push(member._id);
  await session.save();
  await session.populate("participants", "fullName username email");

  res.status(201).json({
    message: "New member created and registered to class successfully!",
    member,
    session,
  });
};

// @desc    Unregister a user from a session
// @route   POST /api/sessions/unregister/:sessionId/:userId
// @access  Private/Admin
export const unregisterUserFromSession = async (req, res) => {
  const { sessionId, userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw createError(400, "Invalid user ID");
  }

  const session = await Session.findById(sessionId);
  if (!session) throw createError(404, "Session not found");

  if (["הושלם", "בוטל"].includes(session.status)) {
    throw createError(
      400,
      "Cannot unregister from a completed or cancelled session"
    );
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const isRegistered = session.participants.some((id) =>
    id.equals(userObjectId)
  );
  if (!isRegistered) {
    throw createError(400, "User is not registered to this session");
  }

  session.participants.pull(userObjectId);
  await session.save();
  await session.populate("participants", "fullName username email");

  res
    .status(200)
    .json({ message: "User unregistered successfully", session: session });
};

// @desc    Join class waiting list
// @route   POST /api/sessions/waitlist/:id
// @access  Private
export const joinWaitingList = async (req, res) => {
  if (req.user && ["staff", "admin", "trainer"].includes(req.user.role)) {
    throw createError(
      403,
      "Staff members cannot join class waiting lists."
    );
  }

  const session = await Session.findById(req.params.id);
  if (!session) throw createError(404, "Session not found");

  if (session.participants.includes(req.user._id)) {
    throw createError(400, "You are already booked for this class");
  }

  if (!session.waitingList) session.waitingList = [];
  if (session.waitingList.includes(req.user._id)) {
    throw createError(400, "You are already on the waiting list for this class");
  }

  session.waitingList.push(req.user._id);
  await session.save();

  // Add confirmation notification
  await User.findByIdAndUpdate(req.user._id, {
    $push: {
      notifications: {
        title: "Joined Waiting List",
        message: `You've joined the waiting list for ${session.type} on ${new Date(session.date).toLocaleDateString()} at ${session.time}. We'll notify you as soon as a seat opens.`,
        date: new Date(),
        read: false,
        type: "waitlist",
      },
    },
  });

  res.json({ message: "Successfully joined waiting list", session });
};

// @desc    Leave class waiting list
// @route   DELETE /api/sessions/waitlist/:id
// @access  Private
export const leaveWaitingList = async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) throw createError(404, "Session not found");

  session.waitingList = (session.waitingList || []).filter(
    (id) => id.toString() !== req.user._id.toString()
  );
  await session.save();

  res.json({ message: "Left waiting list", session });
};

// @desc    Reschedule a class (Max 2 times, up to 4 hours before)
// @route   POST /api/sessions/reschedule
// @access  Private
export const rescheduleSession = async (req, res) => {
  const { oldSessionId, newSessionId } = req.body;
  if (!oldSessionId || !newSessionId) {
    throw createError(400, "Both old and new session IDs are required");
  }

  const oldSession = await Session.findById(oldSessionId);
  const newSession = await Session.findById(newSessionId);
  if (!oldSession || !newSession) throw createError(404, "Session not found");

  // Check 4-hour rule on old session
  const oldDateTime = new Date(oldSession.date);
  const [h, m] = oldSession.time.split(":").map(Number);
  oldDateTime.setHours(h, m, 0, 0);
  const diffHours = (oldDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
  if (diffHours < 4 && diffHours > 0) {
    throw createError(400, "Rescheduling is only allowed at least 4 hours before class start");
  }

  // Check max 2 reschedules limit for user
  const user = await User.findById(req.user._id);
  const reschedCount = (user.rescheduleCount && user.rescheduleCount.get(oldSessionId.toString())) || 0;
  if (reschedCount >= 2) {
    throw createError(400, "Maximum of 2 reschedules allowed for this class");
  }

  // Check new session capacity
  if (newSession.participants.length >= newSession.maxParticipants) {
    throw createError(400, "The requested new session is full");
  }

  // Remove from old session
  oldSession.participants = oldSession.participants.filter(
    (id) => id.toString() !== req.user._id.toString()
  );
  await oldSession.save();

  // Add to new session
  newSession.participants.push(req.user._id);
  if (newSession.waitingList) {
    newSession.waitingList = newSession.waitingList.filter(
      (id) => id.toString() !== req.user._id.toString()
    );
  }
  await newSession.save();

  // Update reschedule counter
  if (!user.rescheduleCount) user.rescheduleCount = new Map();
  user.rescheduleCount.set(newSessionId.toString(), reschedCount + 1);

  // Add notification
  user.notifications.push({
    title: "Class Rescheduled",
    message: `You successfully rescheduled from ${oldSession.type} (${oldSession.time}) to ${newSession.type} on ${new Date(newSession.date).toLocaleDateString()} at ${newSession.time}.`,
    date: new Date(),
    read: false,
    type: "reschedule",
  });
  await user.save();

  res.json({
    message: "Class rescheduled successfully!",
    oldSession,
    newSession,
  });
};

// @desc    Bulk create classes for the next 7 days (Admin / Staff feature)
// @route   POST /api/sessions/bulk-create-week
// @access  Private/Admin
export const bulkCreateWeeklyClasses = async (req, res) => {
  const customTemplates = req.body?.templates || req.body?.classes;
  const defaultTemplates = [
    { time: "07:00", type: "Reformer Core Power", difficulty: "Intermediate", duration: 55, maxParticipants: 8, location: "סטודיו", trainer: { name: "Rotem", bio: "Certified Pilates Master Trainer" }, description: "High-intensity reformer workout targeting core strength and endurance." },
    { time: "09:00", type: "Classic Mat Pilates", difficulty: "Beginner", duration: 50, maxParticipants: 12, location: "סטודיו", trainer: { name: "Sarah Jenkins", bio: "Classical Pilates Specialist" }, description: "Fundamental mat exercises focusing on alignment and breath control." },
    { time: "11:00", type: "Reformer Flow & Flex", difficulty: "Beginner", duration: 55, maxParticipants: 8, location: "סטודיו", trainer: { name: "Rotem", bio: "Certified Pilates Master Trainer" }, description: "Dynamic lengthening and flexibility training on the reformer." },
    { time: "17:30", type: "Tower & Cadillac Stretch", difficulty: "Intermediate", duration: 60, maxParticipants: 8, location: "סטודיו", trainer: { name: "Sarah Jenkins", bio: "Classical Pilates Specialist" }, description: "Full-body elongation utilizing tower springs and cadillac bars." },
    { time: "19:00", type: "Athletic Reformer", difficulty: "Advanced", duration: 55, maxParticipants: 8, location: "סטודיו", trainer: { name: "Rotem", bio: "Certified Pilates Master Trainer" }, description: "Advanced power flows with resistance for seasoned practitioners." },
  ];

  const templates = (Array.isArray(customTemplates) && customTemplates.length > 0)
    ? customTemplates
    : defaultTemplates;

  const createdSessions = [];
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const classDate = new Date(today);
    classDate.setDate(today.getDate() + i);
    const dateStr = classDate.toISOString().split("T")[0];

    for (const tpl of templates) {
      const type = tpl.type || tpl.name;
      const trainerObj = typeof tpl.trainer === "string"
        ? { name: tpl.trainer, bio: "Certified Pilates Instructor", photo: "/RotemLogo.png" }
        : (tpl.trainer || { name: "Sarah Jenkins", bio: "Certified Pilates Instructor", photo: "/RotemLogo.png" });

      const exists = await Session.findOne({
        date: new Date(dateStr),
        time: tpl.time,
        type: type,
      });

      if (!exists) {
        const session = await Session.create({
          date: new Date(dateStr),
          time: tpl.time,
          duration: Number(tpl.duration || 55),
          type: type,
          difficulty: tpl.difficulty || "Beginner",
          trainer: trainerObj,
          description: tpl.description || `Group ${type} session focusing on strength, posture, and core control.`,
          status: "מתוכנן",
          location: tpl.location || "סטודיו",
          maxParticipants: Number(tpl.maxParticipants || tpl.seats || 8),
        });
        createdSessions.push(session);
      }
    }
  }

  res.status(201).json({
    message: `Successfully created ${createdSessions.length} sessions across the 7-day schedule!`,
    createdCount: createdSessions.length,
    sessions: createdSessions,
  });
};
