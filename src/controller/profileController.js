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
    console.log('Removing profile picture for user ID:', userId);

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // FIXED: Check only picture field (since picture_public_id doesn't exist)
    if (!user.picture || user.picture.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: "No profile picture to remove" 
      });
    }

    console.log('Current picture:', user.picture);

    // Try to delete from Cloudinary if it's a Cloudinary URL
    if (user.picture.includes('cloudinary')) {
      try { 
        const urlParts = user.picture.split('/');
        const uploadIndex = urlParts.indexOf('upload');
        
        if (uploadIndex !== -1) {
          // Get everything after 'upload/'
          const afterUpload = urlParts.slice(uploadIndex + 1).join('/');
          // Remove version and file extension
          const publicId = afterUpload.replace(/^v\d+\//, '').replace(/\.[^/.]+$/, '');
          
          console.log('Extracted public_id:', publicId);
          
          // Delete from Cloudinary
          await cloudinary.uploader.destroy(publicId, { 
            resource_type: "image" 
          });
          console.log('Deleted from Cloudinary:', publicId);
        }
      } catch (cloudinaryError) {
        console.log('Cloudinary delete error (non-critical):', cloudinaryError.message);
        // Continue even if Cloudinary delete fails
      }
    }

    // Clear picture field
    user.picture = '';
    await user.save();

    console.log('Profile picture removed from database');

    res.status(200).json({ 
      success: true, 
      message: "Profile picture removed successfully",
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        picture: user.picture,
        role: user.role
      }
    });

  } catch (error) {
    console.error("Remove error:", error.message);
    res.status(500).json({ 
      success: false, 
      message: "Failed to remove profile picture",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
