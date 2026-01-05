const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    otp: { type: Number, required: true },
    status: { type: Number, default: 0 }, // 0 = unused, 1 = used
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

// 🔥 FIX HERE
const OtpModel =
  mongoose.models.otps || mongoose.model("otps", otpSchema);

module.exports = OtpModel;
