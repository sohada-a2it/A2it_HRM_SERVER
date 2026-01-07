// 📁 utility/SendEmailUtility.js - SIMPLE FIXED VERSION
const nodemailer = require('nodemailer');

const SendEmailUtility = async (EmailTo, EmailSubject, EmailText) => {
    console.log('📧 SendEmailUtility called:', {
        to: EmailTo,
        subject: EmailSubject,
        timestamp: new Date().toISOString()
    });

    try {
        // Hostinger SMTP configuration
        const transporter = nodemailer.createTransport({
            host: 'smtp.hostinger.com',
            port: 587, // Hostinger uses 587 for TLS
            secure: false, // false for TLS
            auth: {
                user: 'admin@attendance-system.a2itltd.com',
                pass: 'w|&fG;1cO'
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Create email options
        const mailOptions = {
            from: '"A2IT HRM System" <admin@attendance-system.a2itltd.com>',
            to: EmailTo,
            subject: EmailSubject,
            text: EmailText,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; color: white;">
                        <h1>A2IT HRM System</h1>
                    </div>
                    <div style="padding: 30px; background: #f9f9f9;">
                        <h2>${EmailSubject}</h2>
                        <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
                            <p style="white-space: pre-line;">${EmailText}</p>
                        </div>
                        <p style="color: #666; font-size: 14px;">
                            This is an automated message from A2IT HRM System.
                        </p>
                    </div>
                </div>
            `
        };

        // Send email
        console.log('🔄 Sending email via Hostinger SMTP...');
        const info = await transporter.sendMail(mailOptions);
        
        console.log('✅ Email sent successfully:', {
            messageId: info.messageId,
            response: info.response?.substring(0, 50) + '...'
        });
        
        return {
            success: true,
            messageId: info.messageId,
            response: info.response
        };
        
    } catch (error) {
        console.error('❌ Email sending failed:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        throw new Error(`Email sending failed: ${error.message}`);
    }
};

// ✅ Export as default
module.exports = SendEmailUtility;