import mongoose from "mongoose";

// Pilates group session model
const sessionSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    time: { type: String, required: true }, // e.g., "20:00"
    duration: { type: Number, required: true, default: 60 }, // in minutes
    type: { type: String, required: true }, // e.g., "Reformer Pilates", "Mat Pilates", etc.
    description: { type: String, default: "Group Pilates training session focusing on strength, posture, and core control." },
    difficulty: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
      default: "Beginner",
    },
    trainer: {
      name: { type: String, default: "Rotem" },
      bio: { type: String, default: "Certified Pilates & Mindfulness Instructor" },
      photo: { type: String, default: "/RotemLogo.png" },
    },
    notes: { type: String },
    status: {
      type: String,
      enum: ["מתוכנן", "בוטל", "הושלם"],
      default: "מתוכנן",
    },
    location: {
      type: String,
      default: "סטודיו",
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    waitingList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    maxParticipants: {
      type: Number,
      default: 10,
    },
  },
  { timestamps: true }
);

const Session =
  mongoose.models.Session || mongoose.model("Session", sessionSchema);

export default Session;
