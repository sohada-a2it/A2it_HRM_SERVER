// 📁 utility/SendEmailUtility.js
const nodemailer = require('nodemailer');

// ✅ Function declaration
async function SendEmailUtility(EmailTo, EmailSubject, EmailText) {
    console.log('📧 SendEmailUtility called');
    
    try {
        // Hostinger SMTP configuration
        const transporter = nodemailer.createTransport({
            host: 'smtp.hostinger.com',
            port: 587,
            secure: false,
            auth: {
                user: 'admin@attendance-system.a2itltd.com',
                pass: 'w|&fG;1cO'
            },
            tls: {
                rejectUnauthorized: false
            }
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

// ✅ Export the function
module.exports = SendEmailUtility;