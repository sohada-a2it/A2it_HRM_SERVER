const User = require('../models/UsersModel');
const bcrypt = require('bcrypt');
const OtpModel = require('../models/OtpModel');  
const sendEmail = require("../utility/SendEmailUtility");

// Admin email from environment
const ADMIN_EMAIL = process.env.ADMIN_EMAIL; // example: admin@a2it.com

// -------------------- Admin Request OTP --------------------
export const adminRequestOtp = async (email) => {
  const MAX_RETRIES = 1;
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    try {
      // Show loading toast on first attempt
      if (attempt === 0) {
        toast.loading("Requesting OTP...", { position: "top-right", duration: Infinity });
      }

      const response = await axios.post(
        "/admin/request-otp",
        { email },
        { timeout: 10000 } // 10 seconds
      );

      // Dismiss loading toast
      toast.dismiss();

      if (response.data && response.data.success) {
        toast.success("OTP sent successfully!", {
          position: "top-right",
          duration: 3000,
          icon: "✅",
        });
        return response.data;
      } else {
        throw new Error(response.data?.message || "Failed to send OTP");
      }
    } catch (error) {
      attempt += 1;

      // Dismiss loading toast
      toast.dismiss();

      // Log full error for debugging
      console.error("❌ OTP request failed:", error.message, error.response?.data);

      if (attempt <= MAX_RETRIES) {
        console.log(`Retrying OTP request... attempt ${attempt}`);
      } else {
        toast.error(
          error.response?.data?.message || "Server timeout. Please try again.",
          { position: "top-right", duration: 4000, icon: "❌" }
        );
        throw error; // Let calling function handle further if needed
      }
    }
  }
};


// -------------------- Admin Verify OTP & Reset User Password --------------------
exports.AdminResetPassword = async (req, res) => {
    try {
        const { userEmail, otp, newPassword } = req.body;

        // Verify OTP for admin and the specific user
        const otpRecord = await OtpModel.findOne({ email: ADMIN_EMAIL, otp, status: 0, userEmail });
        if (!otpRecord) {
            return res.status(400).json({ status: "fail", message: "Invalid OTP" });
        }

        // Mark OTP as used
        otpRecord.status = 1;
        await otpRecord.save();

        // Hash the new password and update user's password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.updateOne({ email: userEmail }, { password: hashedPassword });

        res.status(200).json({ status: "success", message: `Password for ${userEmail} reset successfully` });

    } catch (error) {
        res.status(500).json({ status: "fail", message: error.message });
    }
};