import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      sparse: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
    },
    password: {
      type: String,
      select: false,
    },
    birthDate: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      default: "female",
    },
    role: {
      type: String,
      enum: ["user", "admin", "trainer", "staff"],
      default: "user",
      select: false,
    },
    subscription: {
      planName: { type: String, default: "Active Membership" },
      startDate: { type: Date, default: Date.now },
      endDate: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      },
      isActive: { type: Boolean, default: true },
    },
    bodyStats: [
      {
        date: { type: Date, default: Date.now },
        weight: { type: Number }, // in kg
        height: { type: Number }, // in cm
        bmi: { type: Number }, // calculated
        bodyFat: { type: Number }, // percentage
        chest: { type: Number }, // in cm
        waist: { type: Number }, // in cm
        hips: { type: Number }, // in cm
        arms: { type: Number }, // in cm
        thighs: { type: Number }, // in cm
        note: { type: String },
        recordedBy: { type: String, default: "Trainer" },
      },
    ],
    notifications: [
      {
        title: { type: String, required: true },
        message: { type: String, required: true },
        date: { type: Date, default: Date.now },
        read: { type: Boolean, default: false },
        type: { type: String, default: "info" }, // booking, cancellation, waitlist, reminder
      },
    ],
    rescheduleCount: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

export default User;
