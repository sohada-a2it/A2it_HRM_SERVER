// 📁 utility/SendEmailUtility.js
const nodemailer = require('nodemailer');

async function SendEmailUtility(EmailTo, EmailSubject, EmailText) {
    console.log('📧 SendEmailUtility called');
    
    try {
        // ✅ SECURE: Use environment variables
        const transporter = nodemailer.createTransport({
            host: 'smtp.hostinger.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_HOST_USER || 'admin@attendance-system.a2itltd.com',
                pass: process.env.EMAIL_HOST_PASSWORD // Get from environment
            },
            tls: {
                rejectUnauthorized: false
            },
            // Add timeout settings to prevent hanging
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000
        });

        const mailOptions = {
            from: '"A2IT HRM" <admin@attendance-system.a2itltd.com>',
            to: EmailTo,
            subject: EmailSubject,
            text: EmailText
        };

        console.log('🔄 Sending email...');
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent:', info.messageId);
        
        return info;
        
    } catch (error) {
        console.error('❌ Email error:', error.message);
        throw error;
    }
}

module.exports = SendEmailUtility;