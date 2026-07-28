const express = require('express');
const router = express.Router();
const ScheduledPdf = require('../models/ScheduledPdf');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

// ============================================================
//  WATI WHATSAPP CONFIGURATION
// ============================================================
const WATI_API_URL = process.env.WATI_API_URL || 'https://live-mt-server.wati.io/10207630';
const WATI_ACCESS_TOKEN = process.env.WATI_ACCESS_TOKEN;
const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || 'kundli_pdf_delivery';
const BROADCAST_NAME = process.env.WHATSAPP_BROADCAST_NAME || 'kundli_pdf_delivery_broadcast';

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
//  SEND WHATSAPP IMMEDIATELY (Main Route)
// ============================================================
router.post('/send-now', async (req, res) => {
  try {
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

    // Log the send in database for audit
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
      attempts: 1
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
        error: error.message
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
//  CHECK STATUS
// ============================================================
router.get('/status/:recordId', async (req, res) => {
  try {
    const record = await ScheduledPdf.findById(req.params.recordId);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    return res.json({
      success: true,
      status: record.status,
      sentAt: record.sentAt,
      attempts: record.attempts,
      error: record.error,
      whatsappSent: record.whatsappSent,
      whatsappError: record.whatsappError
    });

  } catch (error) {
    console.error('Status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get status'
    });
  }
});

// ============================================================
//  TEST ROUTE
// ============================================================
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'WhatsApp API is working (Instant Send Mode)',
    config: {
      watiApiUrl: WATI_API_URL,
      hasToken: !!WATI_ACCESS_TOKEN,
      templateName: TEMPLATE_NAME,
      mode: 'INSTANT_SEND'
    }
  });
});

module.exports = { router, sendWhatsApp };