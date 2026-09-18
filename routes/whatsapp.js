const express = require('express');
const router = express.Router();
const ScheduledPdf = require('../models/ScheduledPdf');
const ScheduledPremiumPdf = require('../models/ScheduledPremiumPdf'); // NEW
const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');

// ============================================================
//  WATI WHATSAPP CONFIGURATION
// ============================================================
const WATI_API_URL = process.env.WATI_API_URL || 'https://live-mt-server.wati.io/10207630';
const WATI_ACCESS_TOKEN = process.env.WATI_ACCESS_TOKEN;
const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || 'kundly_pdf_delivery';
const BROADCAST_NAME = process.env.WHATSAPP_BROADCAST_NAME || 'kundly_pdf_delivery_broadcast';

// ============================================================
//  SEND WHATSAPP INSTANTLY (Core Function)
// ============================================================
async function sendWhatsApp(phoneNumber, pdfUrl, pdfName, customerName) {
  try {
    // Clean phone number
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

    console.log(`📤 Sending WhatsApp to ${cleanPhone}`);
    console.log(`📄 PDF URL: ${pdfUrl}`);

    const response = await axios.post(
      `${WATI_API_URL}/api/v1/sendTemplateMessage`,
      {
        template_name: TEMPLATE_NAME,
        broadcast_name: BROADCAST_NAME,
        parameters: [
          { name: 'customerName', value: customerName || 'User' },
          { name: 'pdfLink', value: pdfUrl },
          { name: 'pdfName', value: pdfName || 'Kundli_Report.pdf' }
        ]
      },
      {
        params: {
          whatsappNumber: cleanPhone
        },
        headers: {
          'Authorization': `Bearer ${WATI_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.result === false) {
      throw new Error(response.data.error || 'WATI reported failure');
    }

    console.log('✅ WhatsApp sent successfully');
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ WhatsApp send error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message
    );
  }
}

// ============================================================
//  PROCESS SCHEDULED MESSAGES - BASIC KUNDLI (Called by cron job)
// ============================================================
async function processScheduledMessages() {
  try {
    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ Database not connected, skipping processing');
      return {
        success: false,
        message: 'Database not connected',
        processed: 0,
        sent: 0,
        failed: 0,
        error: 'Database connection not available'
      };
    }

    console.log('⏰ Processing scheduled WhatsApp messages (Basic)...');

    // Find all scheduled messages that are due and not sent
    const dueRecords = await ScheduledPdf.find({
      status: 'scheduled',
      whatsappSent: false,
      scheduledTime: { $lte: new Date() }
    }).maxTimeMS(5000); // Add timeout to prevent long-running queries

    if (dueRecords.length === 0) {
      console.log('📭 No scheduled messages to process (Basic)');
      return {
        success: true,
        message: 'No scheduled messages to process',
        processed: 0,
        sent: 0,
        failed: 0
      };
    }

    console.log(`📬 Found ${dueRecords.length} scheduled messages to process (Basic)`);

    let sent = 0;
    let failed = 0;

    for (const record of dueRecords) {
      try {
        // Check if max attempts reached
        if (record.attempts >= record.maxAttempts) {
          console.log(`⚠️ Max attempts reached for ${record.userDetails.mobile}, marking as failed`);
          record.status = 'failed';
          record.whatsappError = 'Max attempts reached';
          await record.save();
          failed++;
          continue;
        }

        // Update attempts
        record.attempts += 1;
        record.lastAttemptAt = new Date();

        console.log(`📤 Sending to ${record.userDetails.mobile} (Attempt ${record.attempts}/${record.maxAttempts})`);

        // Send WhatsApp
        await sendWhatsApp(
          record.userDetails.mobile,
          record.pdf.cloudinaryUrl || record.pdf.url,
          record.pdf.filename,
          record.userDetails.fullName
        );

        // Update record as sent
        record.status = 'sent';
        record.whatsappSent = true;
        record.sentAt = new Date();
        await record.save();
        sent++;

        console.log(`✅ Sent to ${record.userDetails.mobile}`);

      } catch (error) {
        console.error(`❌ Failed to send to ${record.userDetails.mobile}:`, error.message);

        // If max attempts reached, mark as failed
        if (record.attempts >= record.maxAttempts) {
          record.status = 'failed';
          record.whatsappError = error.message;
          await record.save();
          failed++;
        } else {
          // Keep as scheduled for retry
          await record.save();
        }
      }
    }

    return {
      success: true,
      message: `Processed ${dueRecords.length} messages`,
      sent: sent,
      failed: failed,
      remaining: dueRecords.length - sent - failed
    };

  } catch (error) {
    console.error('❌ Error processing scheduled messages:', error);

    // Check if it's a Mongoose timeout error
    if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
      return {
        success: false,
        message: 'Database operation timed out',
        error: 'MongoDB connection timeout',
        processed: 0,
        sent: 0,
        failed: 0
      };
    }

    return {
      success: false,
      message: 'Failed to process scheduled messages',
      error: error.message,
      processed: 0,
      sent: 0,
      failed: 0
    };
  }
}

// ============================================================
//  PROCESS SCHEDULED MESSAGES - PREMIUM KUNDLI (Called by cron job)
//  NEW: this is the piece that was completely missing before. Without
//  it, records written to ScheduledPremiumPdf by
//  /api/premium-kundli/generate-and-schedule were never read back out
//  by anything, so the 10-minute WhatsApp send never fired.
// ============================================================
async function processScheduledPremiumMessages() {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ Database not connected, skipping premium processing');
      return {
        success: false,
        message: 'Database not connected',
        processed: 0,
        sent: 0,
        failed: 0,
        error: 'Database connection not available'
      };
    }

    console.log('⏰ Processing scheduled WhatsApp messages (Premium)...');

    const dueRecords = await ScheduledPremiumPdf.find({
      status: 'scheduled',
      whatsappSent: false,
      scheduledTime: { $lte: new Date() }
    }).maxTimeMS(5000);

    if (dueRecords.length === 0) {
      console.log('📭 No scheduled messages to process (Premium)');
      return {
        success: true,
        message: 'No scheduled premium messages to process',
        processed: 0,
        sent: 0,
        failed: 0
      };
    }

    console.log(`📬 Found ${dueRecords.length} scheduled premium messages to process`);

    let sent = 0;
    let failed = 0;

    for (const record of dueRecords) {
      try {
        if (record.attempts >= record.maxAttempts) {
          console.log(`⚠️ Max attempts reached for ${record.userDetails.mobile}, marking as failed (Premium)`);
          record.status = 'failed';
          record.whatsappError = 'Max attempts reached';
          await record.save();
          failed++;
          continue;
        }

        record.attempts += 1;
        record.lastAttemptAt = new Date();

        console.log(`📤 Sending premium to ${record.userDetails.mobile} (Attempt ${record.attempts}/${record.maxAttempts})`);

        await sendWhatsApp(
          record.userDetails.mobile,
          record.pdf.cloudinaryUrl || record.pdf.url,
          record.pdf.filename,
          record.userDetails.fullName
        );

        record.status = 'sent';
        record.whatsappSent = true;
        record.sentAt = new Date();
        await record.save();
        sent++;

        console.log(`✅ Sent premium to ${record.userDetails.mobile}`);

      } catch (error) {
        console.error(`❌ Failed to send premium to ${record.userDetails.mobile}:`, error.message);

        if (record.attempts >= record.maxAttempts) {
          record.status = 'failed';
          record.whatsappError = error.message;
          await record.save();
          failed++;
        } else {
          await record.save();
        }
      }
    }

    return {
      success: true,
      message: `Processed ${dueRecords.length} premium messages`,
      sent: sent,
      failed: failed,
      remaining: dueRecords.length - sent - failed
    };

  } catch (error) {
    console.error('❌ Error processing scheduled premium messages:', error);

    if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
      return {
        success: false,
        message: 'Database operation timed out',
        error: 'MongoDB connection timeout',
        processed: 0,
        sent: 0,
        failed: 0
      };
    }

    return {
      success: false,
      message: 'Failed to process scheduled premium messages',
      error: error.message,
      processed: 0,
      sent: 0,
      failed: 0
    };
  }
}

// ============================================================
//  SEND WHATSAPP WITH 10 MIN DELAY (Main Route - Basic, manual/legacy)
// ============================================================
router.post('/send-with-delay', async (req, res) => {
  try {
    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected. Please try again later.'
      });
    }

    const { phoneNumber, pdfUrl, pdfName, customerName, email, city, delayMinutes = 10 } = req.body;

    if (!phoneNumber || !pdfUrl) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and PDF URL are required'
      });
    }

    // Upload to Cloudinary if not already
    let cloudinaryUrl = pdfUrl;
    if (!pdfUrl.includes('cloudinary')) {
      try {
        const result = await cloudinary.uploader.upload(pdfUrl, {
          resource_type: 'raw',
          folder: 'kundli_reports',
          public_id: `kundli_${Date.now()}`,
          use_filename: true,
          unique_filename: true
        });
        cloudinaryUrl = result.secure_url;
        console.log('✅ Uploaded to Cloudinary:', cloudinaryUrl);
      } catch (uploadError) {
        console.warn('⚠️ Cloudinary upload failed, using original URL');
      }
    }

    // Calculate scheduled time
    const scheduledTime = new Date(Date.now() + delayMinutes * 60 * 1000);

    // Create scheduled record
    const record = new ScheduledPdf({
      userDetails: {
        fullName: customerName || 'User',
        email: email || '',
        mobile: phoneNumber,
        city: city || ''
      },
      pdf: {
        url: pdfUrl,
        cloudinaryUrl: cloudinaryUrl,
        filename: pdfName || 'Kundli_Report.pdf'
      },
      status: 'scheduled',
      scheduledTime: scheduledTime,
      whatsappSent: false,
      attempts: 0
    });
    await record.save();

    console.log(`📅 WhatsApp scheduled for ${scheduledTime.toISOString()} (in ${delayMinutes} minutes)`);

    return res.json({
      success: true,
      message: `WhatsApp scheduled to send in ${delayMinutes} minutes`,
      recordId: record._id,
      scheduledTime: scheduledTime,
      status: 'scheduled'
    });

  } catch (error) {
    console.error('Schedule error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to schedule WhatsApp',
      error: error.message
    });
  }
});

// ============================================================
//  PROCESS SCHEDULED WHATSAPP (API Endpoint - Basic)
// ============================================================
router.post('/process-scheduled', async (req, res) => {
  try {
    const result = await processScheduledMessages();

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(500).json(result);
    }
  } catch (error) {
    console.error('❌ Error in process-scheduled route:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process scheduled messages',
      error: error.message
    });
  }
});

// ============================================================
//  PROCESS SCHEDULED WHATSAPP (API Endpoint - Premium) - NEW
//  Lets you manually trigger/debug premium processing the same way
//  /process-scheduled does for basic.
// ============================================================
router.post('/process-scheduled-premium', async (req, res) => {
  try {
    const result = await processScheduledPremiumMessages();

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(500).json(result);
    }
  } catch (error) {
    console.error('❌ Error in process-scheduled-premium route:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process scheduled premium messages',
      error: error.message
    });
  }
});

// ============================================================
//  SEND WHATSAPP IMMEDIATELY (Emergency/Manual Route)
// ============================================================
router.post('/send-now', async (req, res) => {
  try {
    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected. Please try again later.'
      });
    }

    const { phoneNumber, pdfUrl, pdfName, customerName, email, city } = req.body;

    if (!phoneNumber || !pdfUrl) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and PDF URL are required'
      });
    }

    // Upload to Cloudinary if not already
    let cloudinaryUrl = pdfUrl;
    if (!pdfUrl.includes('cloudinary')) {
      try {
        const result = await cloudinary.uploader.upload(pdfUrl, {
          resource_type: 'raw',
          folder: 'kundli_reports',
          public_id: `kundli_${Date.now()}`,
          use_filename: true,
          unique_filename: true
        });
        cloudinaryUrl = result.secure_url;
        console.log('✅ Uploaded to Cloudinary:', cloudinaryUrl);
      } catch (uploadError) {
        console.warn('⚠️ Cloudinary upload failed, using original URL');
      }
    }

    // Send WhatsApp instantly
    const result = await sendWhatsApp(
      phoneNumber,
      cloudinaryUrl,
      pdfName || 'Kundli_Report.pdf',
      customerName || 'User'
    );

    // Log the send in database
    const record = new ScheduledPdf({
      userDetails: {
        fullName: customerName || 'User',
        email: email || '',
        mobile: phoneNumber,
        city: city || ''
      },
      pdf: {
        url: pdfUrl,
        cloudinaryUrl: cloudinaryUrl,
        filename: pdfName || 'Kundli_Report.pdf'
      },
      status: 'sent',
      sentAt: new Date(),
      whatsappSent: true,
      attempts: 1,
      scheduledTime: new Date()
    });
    await record.save();

    return res.json({
      success: true,
      message: 'WhatsApp sent successfully!',
      recordId: record._id,
      data: result.data
    });

  } catch (error) {
    console.error('Send error:', error);

    // Log the failure
    try {
      const { phoneNumber, pdfUrl, pdfName, customerName, email, city } = req.body;
      const record = new ScheduledPdf({
        userDetails: {
          fullName: customerName || 'User',
          email: email || '',
          mobile: phoneNumber || '',
          city: city || ''
        },
        pdf: {
          url: pdfUrl || '',
          cloudinaryUrl: pdfUrl || '',
          filename: pdfName || 'Kundli_Report.pdf'
        },
        status: 'failed',
        whatsappSent: false,
        whatsappError: error.message,
        attempts: 1,
        scheduledTime: new Date()
      });
      await record.save();
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to send WhatsApp',
      error: error.message
    });
  }
});

// ============================================================
//  CHECK STATUS (Basic)
// ============================================================
router.get('/status/:recordId', async (req, res) => {
  try {
    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected. Please try again later.'
      });
    }

    const record = await ScheduledPdf.findById(req.params.recordId);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    const timeRemaining = record.scheduledTime ?
      Math.max(0, Math.floor((new Date(record.scheduledTime) - new Date()) / 1000)) : 0;

    return res.json({
      success: true,
      status: record.status,
      scheduledTime: record.scheduledTime,
      sentAt: record.sentAt,
      attempts: record.attempts,
      maxAttempts: record.maxAttempts,
      error: record.error || record.whatsappError,
      whatsappSent: record.whatsappSent,
      timeRemaining: timeRemaining, // in seconds
      timeRemainingFormatted: timeRemaining > 0 ?
        `${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s` : 'Ready to send'
    });

  } catch (error) {
    console.error('Status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get status',
      error: error.message
    });
  }
});

// ============================================================
//  CANCEL SCHEDULED SEND (Basic)
// ============================================================
router.delete('/cancel/:recordId', async (req, res) => {
  try {
    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected. Please try again later.'
      });
    }

    const record = await ScheduledPdf.findById(req.params.recordId);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    if (record.status === 'sent') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel: Already sent'
      });
    }

    if (record.status === 'failed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel: Already failed'
      });
    }

    record.status = 'failed';
    record.whatsappError = 'Cancelled by user';
    await record.save();

    return res.json({
      success: true,
      message: 'Scheduled send cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel',
      error: error.message
    });
  }
});

// ============================================================
//  GET ALL SCHEDULED MESSAGES (Admin - Basic)
// ============================================================
router.get('/all', async (req, res) => {
  try {
    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected. Please try again later.'
      });
    }

    const records = await ScheduledPdf.find()
      .sort({ createdAt: -1 })
      .limit(100); // Limit to 100 records for performance

    return res.json({
      success: true,
      count: records.length,
      records: records
    });

  } catch (error) {
    console.error('Get all error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get records',
      error: error.message
    });
  }
});

// ============================================================
//  GET ALL SCHEDULED PREMIUM MESSAGES (Admin) - NEW
// ============================================================
router.get('/all-premium', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected. Please try again later.'
      });
    }

    const records = await ScheduledPremiumPdf.find()
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({
      success: true,
      count: records.length,
      records: records
    });

  } catch (error) {
    console.error('Get all premium error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get premium records',
      error: error.message
    });
  }
});

// ============================================================
//  TEST ROUTE
// ============================================================
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'WhatsApp API is working (Scheduled Send Mode - 10 min delay)',
    config: {
      watiApiUrl: WATI_API_URL,
      hasToken: !!WATI_ACCESS_TOKEN,
      templateName: TEMPLATE_NAME,
      mode: 'SCHEDULED_SEND',
      delayMinutes: 10,
      dbStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
    }
  });
});

module.exports = {
  router,
  sendWhatsApp,
  processScheduledMessages,
  processScheduledPremiumMessages // NEW
};