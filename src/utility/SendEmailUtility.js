// utility/SendEmailUtility.js - এডিট করুন
const nodemailer = require("nodemailer");
require('dotenv').config(); // 👈 যোগ করুন

const SendEmailUtility = async (EmailTo, EmailSubject, EmailText) => {
  try {
    console.log('📧 ======= EMAIL SENDING START =======');
    console.log('To:', EmailTo);
    console.log('Subject:', EmailSubject);
    console.log('Text length:', EmailText.length);
    console.log('EMAIL_USER:', process.env.EMAIL_USER);
    console.log('EMAIL_PASS exists:', !!process.env.EMAIL_PASS);

    // Configure transporter with proper settings
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER || "a2itsohada@gmail.com",
        pass: process.env.EMAIL_PASS || "cfet pnud xynr yuwe",
      },
      tls: {
        rejectUnauthorized: false // Allow self-signed certificates
      }
    });

    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP Connection verified');

    // Email options
    let mailOption = {
      from: `"A2IT HRM System" <${process.env.EMAIL_USER || "a2itsohada@gmail.com"}>`,
      to: EmailTo,
      subject: EmailSubject,
      text: EmailText,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; color: white; text-align: center;">
            <h1 style="margin: 0;">A2IT HRM System</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2 style="color: #374151;">Password Reset OTP</h2>
            <p style="color: #6b7280; line-height: 1.6;">
              You have requested to reset password for user: <strong>${EmailText.split('for ')[1]?.split(' ')[0] || 'User'}</strong>
            </p>
            <div style="background: white; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0; border: 1px solid #e5e7eb;">
              <div style="font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #7c3aed;">
                ${EmailText.match(/OTP Code: (\d{6})/)?.[1] || '123456'}
              </div>
              <div style="color: #9ca3af; margin-top: 10px; font-size: 14px;">
                This OTP is valid for 10 minutes
              </div>
            </div>
            <p style="color: #6b7280; font-size: 14px;">
              If you didn't request this, please ignore this email.
            </p>
          </div>
          <div style="background: #f3f4f6; padding: 15px; text-align: center; color: #9ca3af; font-size: 12px;">
            © ${new Date().getFullYear()} A2IT HRM System. All rights reserved.
          </div>
        </div>
      `
    };

    console.log('📤 Sending email...');
    const info = await transporter.sendMail(mailOption);
    console.log('✅ Email sent successfully! Message ID:', info.messageId);
    console.log('📧 ======= EMAIL SENDING END =======');
    
    return info;
  } catch (error) {
    console.error('❌ EMAIL SENDING FAILED:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      command: error.command
    });
    throw error;
  }
};

module.exports = SendEmailUtility;