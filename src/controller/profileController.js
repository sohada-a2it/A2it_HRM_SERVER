const User = require("../models/UsersModel");
const cloudinary = require("../services/Cloudinary");
const streamifier = require("streamifier");

// Upload Profile Picture
exports.uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const publicId = `hrm_profile_${userId}_${Date.now()}`;

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "hrm_profiles",
          public_id: publicId,
          transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }]
        },
        (error, result) => error ? reject(error) : resolve(result)
      );
      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    // Delete old picture if exists
    if (user.picture_public_id) {
      try {
        await cloudinary.uploader.destroy(user.picture_public_id, { resource_type: "image" });
      } catch (err) {
        console.log("Non-critical delete error:", err.message);
      }
    }

    // Save new picture
    user.picture = result.secure_url;
    user.picture_public_id = result.public_id;
    await user.save();

    res.status(200).json({ success: true, message: "Profile picture uploaded", pictureUrl: result.secure_url });

  } catch (error) {
    console.error("Upload error:", error.message);
    res.status(500).json({ success: false, message: `Upload failed: ${error.message}` });
  }
};

// Remove Profile Picture
exports.removeProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!user.picture_public_id) return res.status(400).json({ success: false, message: "No profile picture to remove" });

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(user.picture_public_id, { resource_type: "image" });

    user.picture = null;
    user.picture_public_id = null;
    await user.save();

    res.status(200).json({ success: true, message: "Profile picture removed" });

  } catch (error) {
    console.error("Remove error:", error.message);
    res.status(500).json({ success: false, message: "Failed to remove picture" });
  }
};
