// backend/src/services/emailService.js
const nodemailer = require('nodemailer');
const logger = require('../config/logger');

/**
 * Email service for sending compiler key exhaustion notifications.
 */
class EmailService {
  constructor() {
    // Create a transporter using SMTP configuration from environment variables
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: parseInt(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Verify the connection configuration
    this.transporter.verify((error, success) => {
      if (error) {
        logger.error('SMTP connection error', { error: error.message });
      } else {
        logger.info('SMTP server is ready to send emails');
      }
    });
  }

  /**
   * Send an exhaustion notification email.
   * @param {Object} keyData - Data about the exhausted key
   * @param {Object} serviceStatus - Current compiler service status
   * @returns {Promise<boolean>} True if email sent successfully, false otherwise
   */
  async sendExhaustionNotification(keyData, serviceStatus) {
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@btechcodingplatform.com',
        to: process.env.COMPILER_KEY_ALERT_EMAIL || 'bharathcheck@gmail.com',
        subject: `[Compiler Keys Alert] API Key Exhausted`,
        text: this._generateEmailText(keyData, serviceStatus),
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Exhaustion notification email sent', { messageId: info.messageId });
      return true;
    } catch (error) {
      logger.error('Failed to send exhaustion notification email', {
        error: error.message,
        keyIndex: keyData.keyIndex,
      });
      return false;
    }
  }

  /**
   * Generate the email text content.
   * @param {Object} keyData - Data about the exhausted key
   * @param {Object} serviceStatus - Current compiler service status
   * @returns {string} Formatted email text
   */
  _generateEmailText(keyData, serviceStatus) {
    const exhaustionTime = new Date().toLocaleString();
    const keyDisplay = keyData.displayName || `Key ${keyData.keyIndex}`;
    const maskedKey = keyData.maskedKey || '****';

    return `
Compiler Key Exhaustion Alert

Details:
- Provider: OnlineCompiler.io
- Key Identifier: ${keyDisplay}
- Masked API Key: ${maskedKey}
- Configured Quota Limit: ${keyData.maxRequestLimit}
- Total Requests Consumed: ${keyData.currentRequestCount}
- Remaining Quota: ${keyData.remainingRequests}
- Exhaustion Timestamp: ${exhaustionTime}
- Another Eligible Key Available: ${serviceStatus.hasAlternate ? 'Yes' : 'No'}
- Current Compiler Service Status: ${serviceStatus.status}

This is an automated notification from the Compiler Key Management System.
Do not reply to this email.
    `.trim();
  }
}

// Export singleton instance
const emailService = new EmailService();
module.exports = { emailService };