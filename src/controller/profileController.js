const User = require('../models/UsersModel');
const cloudinary = require('../services/Cloudinary');
const streamifier = require('streamifier');

// Upload Profile Picture
exports.uploadProfilePicture = async (req, res) => {
  try {
    console.log('Upload profile picture request received');
    console.log('File received:', req.file ? 'Yes' : 'No');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Check Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || 
        !process.env.CLOUDINARY_API_KEY || 
        !process.env.CLOUDINARY_API_SECRET) {
      console.error('Cloudinary configuration missing in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Cloudinary not configured'
      });
    }

    const userId = req.user.id || req.user._id;
    console.log('User ID:', userId);

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('Uploading for user:', user.email);

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP) are allowed.'
      });
    }

    // Validate file size (max 5MB)
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB.'
      });
    }

    // Generate unique public ID
    const publicId = `hrm_profile_${userId}_${Date.now()}`;

    // Upload to Cloudinary using promise
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'hrm_profiles',
          public_id: publicId,
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' }
          ],
          resource_type: 'image'
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(new Error(`Cloudinary upload failed: ${error.message}`));
          } else {
            console.log('Cloudinary upload successful:', result.secure_url);
            resolve(result);
          }
        }
      );

      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    // Delete old picture from Cloudinary if exists
    if (user.picture && user.picture.includes('cloudinary')) {
      try {
        // Extract public ID from URL
        const urlParts = user.picture.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const oldPublicId = fileName.split('.')[0];
        
        await cloudinary.uploader.destroy(oldPublicId, {
          resource_type: 'image'
        });
        console.log('Old picture deleted from Cloudinary:', oldPublicId);
      } catch (deleteError) {
        console.log('Error deleting old picture (non-critical):', deleteError.message);
      }
    }

    // Update user with new picture URL
    user.picture = uploadResult.secure_url;
    await user.save();

    console.log('User picture updated successfully');

    res.status(200).json({
      success: true,
      message: 'Profile picture uploaded successfully',
      pictureUrl: uploadResult.secure_url,
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
    console.error('Profile picture upload error:', error);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload profile picture',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
        message: 'User not found'
      });
    }

    if (!user.picture) {
      return res.status(400).json({
        success: false,
        message: 'No profile picture to remove'
      });
    }

    console.log('Current picture:', user.picture);

    // Delete from Cloudinary if it's a Cloudinary URL
    if (user.picture.includes('cloudinary')) {
      try {
        // Extract public ID from URL
        const urlParts = user.picture.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const publicId = fileName.split('.')[0];
        
        await cloudinary.uploader.destroy(publicId, {
          resource_type: 'image'
        });
        console.log('Picture deleted from Cloudinary:', publicId);
      } catch (error) {
        console.log('Error deleting from Cloudinary (non-critical):', error.message);
      }
    }

    // Remove picture from user
    user.picture = null;
    await user.save();

    console.log('Profile picture removed from user');

    res.status(200).json({
      success: true,
      message: 'Profile picture removed successfully',
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
    console.error('Profile picture remove error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove profile picture',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};