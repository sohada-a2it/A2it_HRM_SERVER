const nodemailer = require("nodemailer");

// send a transporter using smtp
const SendEmailUtility = async(EmailTo,EmailSubject,EmailText)=>{
    const transporter = nodemailer.createTransport({
        service: "Gmail", 
        auth: {
          user: "a2itsohada@gmail.com",
          pass: "cfet pnud xynr yuwe",
        },
      });
    //   the email message
      let mailOption = {
        from: '"A2it_HRM" <a2itsohada@gmail.com>',
        to: EmailTo,
        subject: EmailSubject,
        text: EmailText
      };
    //   send email
      return await transporter.sendMail(mailOption);
}
module.exports = SendEmailUtility;