import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "./src/models/userModel.js";

dotenv.config();

const seedUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: "pilatesapp" });
    console.log("Connected to MongoDB");

    const salt = await bcrypt.genSalt(10);
    const adminHash = await bcrypt.hash("Admin123!", salt);
    const staffHash = await bcrypt.hash("Staff123!", salt);
    const memberHash = await bcrypt.hash("Member123!", salt);

    // 1. Admin User
    await User.findOneAndUpdate(
      { username: "admin" },
      {
        username: "admin",
        fullName: "Studio Administrator",
        email: "admin@pilates.com",
        password: adminHash,
        birthDate: new Date("1990-01-01"),
        gender: "female",
        role: "admin",
      },
      { upsert: true, new: true }
    );
    console.log("✅ Admin user ready: admin / Admin123!");

    // 2. Staff User
    await User.findOneAndUpdate(
      { username: "staff" },
      {
        username: "staff",
        fullName: "Sarah Jenkins (Staff)",
        email: "staff@pilates.com",
        password: staffHash,
        birthDate: new Date("1992-05-15"),
        gender: "female",
        role: "staff",
        subscription: {
          planName: "Staff Instructor",
          startDate: new Date(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );
    console.log("✅ Staff user ready: staff / Staff123!");

    // 3. Member User
    await User.findOneAndUpdate(
      { username: "member" },
      {
        username: "member",
        fullName: "Emma Watson (Member)",
        email: "member@pilates.com",
        password: memberHash,
        birthDate: new Date("1996-08-20"),
        gender: "female",
        role: "user",
        subscription: {
          planName: "Unlimited Monthly Membership",
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
        bodyStats: [
          {
            date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
            weight: 64.0,
            height: 168,
            bmi: 22.7,
            bodyFat: 22.5,
            waist: 70,
            hips: 95,
            chest: 88,
            note: "Initial assessment. Good core endurance.",
            recordedBy: "Rotem",
          },
          {
            date: new Date(),
            weight: 62.5,
            height: 168,
            bmi: 22.1,
            bodyFat: 21.2,
            waist: 68,
            hips: 93,
            chest: 87,
            note: "Noticeable posture improvement and stability.",
            recordedBy: "Sarah (Staff)",
          },
        ],
        notifications: [
          {
            title: "Welcome to Pilates Studio!",
            message: "Your monthly membership is active. Enjoy booking your classes.",
            date: new Date(),
            read: false,
            type: "info",
          },
        ],
      },
      { upsert: true, new: true }
    );
    console.log("✅ Member user ready: member / Member123!");

    // Also list all users
    const all = await User.find({}).select("username fullName role email");
    console.log("\nAll users in DB:", all);

    await mongoose.disconnect();
    console.log("Done!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding error:", err);
    process.exit(1);
  }
};

seedUsers();
