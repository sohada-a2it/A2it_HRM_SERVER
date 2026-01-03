const User = require('../models/UsersModel');
const cloudinary = require('../services/Cloudinary');
const streamifier = require('streamifier');

// Upload Profile Picture
exports.uploadProfilePicture = async (req, res) => {
  try {
    console.log('Upload profile picture request received');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only images are allowed.'
      });
    }

    // Validate file size (max 5MB)
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB.'
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

    // Check Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || 
        !process.env.CLOUDINARY_API_KEY || 
        !process.env.CLOUDINARY_API_SECRET) {
      console.error('Cloudinary configuration missing');
      
      // Fallback: Save as Base64 in database
      const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      user.picture = base64Image;
      await user.save();

      return res.status(200).json({
        success: true,
        message: 'Profile picture uploaded (local storage)',
        pictureUrl: base64Image,
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          picture: user.picture
        }
      });
    }

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'hrm-profile-pictures',
          public_id: `profile_${userId}_${Date.now()}`,
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(error);
          } else {
            console.log('Cloudinary upload successful:', result.secure_url);
            resolve(result);
          }
        }
      );

      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    // Delete old picture from Cloudinary if exists
    if (user.picture && user.picture.includes('res.cloudinary.com')) {
      try {
        const urlParts = user.picture.split('/');
        const publicIdWithExtension = urlParts[urlParts.length - 1];
        const publicId = publicIdWithExtension.split('.')[0];
        await cloudinary.uploader.destroy(publicId);
        console.log('Old picture deleted from Cloudinary');
      } catch (error) {
        console.log('Error deleting old picture from Cloudinary:', error.message);
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
    
    // Fallback to Base64 if Cloudinary fails
    try {
      if (req.file && req.file.buffer) {
        const userId = req.user.id || req.user._id;
        const user = await User.findById(userId);
        
        if (user) {
          const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
          user.picture = base64Image;
          await user.save();
          
          return res.status(200).json({
            success: true,
            message: 'Profile picture uploaded (fallback to local storage)',
            pictureUrl: base64Image,
            user: {
              _id: user._id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              picture: user.picture
            }
          });
        }
      }
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload profile picture',
      error: error.message
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
    if (user.picture.includes('res.cloudinary.com')) {
      try {
        const urlParts = user.picture.split('/');
        const publicIdWithExtension = urlParts[urlParts.length - 1];
        const publicId = publicIdWithExtension.split('.')[0];
        await cloudinary.uploader.destroy(publicId);
        console.log('Picture deleted from Cloudinary');
      } catch (error) {
        console.log('Error deleting from Cloudinary:', error.message);
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
      error: error.message
    });
  }
};