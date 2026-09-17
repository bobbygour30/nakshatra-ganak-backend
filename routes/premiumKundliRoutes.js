const express = require('express');
const router = express.Router();
const axios = require('axios');
const ScheduledPremiumPdf = require('../models/ScheduledPremiumPdf');
const cloudinary = require('cloudinary').v2;
const { verifyRazorpayPayment } = require('./premiumKundliPaymantRoutes');

// ============================================================
// ASTROLOGYAPI.COM PREMIUM KUNDLI PDF CONFIGURATION
// ============================================================

const ASTROLOGYAPI_PDF_BASE = 'https://pdf.astrologyapi.com/v1';
const ASTROLOGYAPI_KEY = process.env.ASTROLOGYAPI_KEY;

console.log('=================================');
console.log('🔥 AstrologyAPI.com PREMIUM Kundli Configuration');
console.log(
  'API Key:',
  ASTROLOGYAPI_KEY ? '✅ Set' : '❌ Missing'
);
console.log('Mode    : PREMIUM PDF WITH 10 MIN WHATSAPP DELAY');
console.log('=================================');

// ============================================================
// ASTROLOGY API HEADERS
// ============================================================

const getAstrologyApiHeaders = () => {
  if (!ASTROLOGYAPI_KEY) {
    return null;
  }

  return {
    'x-astrologyapi-key': ASTROLOGYAPI_KEY,
    'Content-Type': 'application/json',
    'Accept-Language': 'en'
  };
};

// ============================================================
// GENERATE PREMIUM PDF + SCHEDULE WHATSAPP AFTER 10 MINUTES
// ============================================================

router.post('/generate-and-schedule', async (req, res) => {
  try {
    const {
      date,
      month,
      year,
      hour,
      minute,
      latitude,
      longitude,
      timezone = 5.5,

      fullName,
      email,
      mobile,
      city,
      gender = 'male',
      language = 'en',

      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    console.log('==========================================');
    console.log('📥 PREMIUM GENERATE + SCHEDULE REQUEST');
    console.log('==========================================');

    console.log('Name:', fullName);
    console.log('Email:', email);
    console.log('Mobile:', mobile);
    console.log('City:', city);
    console.log('DOB:', date, month, year);
    console.log('Birth Time:', hour, minute);
    console.log('Latitude:', latitude);
    console.log('Longitude:', longitude);
    console.log('Timezone:', timezone);
    console.log('Payment ID:', razorpay_payment_id);
    console.log('Order ID:', razorpay_order_id);

    // ========================================================
    // VALIDATE BIRTH DETAILS
    // ========================================================

    if (
      !date ||
      !month ||
      !year ||
      hour === undefined ||
      minute === undefined ||
      latitude === undefined ||
      longitude === undefined ||
      !fullName
    ) {
      return res.status(400).json({
        success: false,
        message: 'Missing required birth details'
      });
    }

    // ========================================================
    // VALIDATE MOBILE
    // ========================================================

    if (!mobile || String(mobile).replace(/\D/g, '').length < 10) {
      return res.status(400).json({
        success: false,
        message:
          'Valid 10-digit mobile number is required for WhatsApp delivery'
      });
    }

    // ========================================================
    // PAYMENT VALIDATION
    // ========================================================

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(402).json({
        success: false,
        message:
          'Payment details are required to generate the Premium Kundli PDF'
      });
    }

    console.log('💳 Verifying Razorpay payment...');

    const verification = await verifyRazorpayPayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });

    if (!verification || !verification.ok) {
      console.error(
        '❌ Payment verification failed:',
        verification?.reason
      );

      return res.status(402).json({
        success: false,
        message: 'Payment verification failed',
        reason: verification?.reason || 'Invalid payment'
      });
    }

    console.log('✅ Payment verified successfully');

    // ========================================================
    // PREVENT DUPLICATE PAYMENT PROCESSING
    // ========================================================

    const existing = await ScheduledPremiumPdf.findOne({
      paymentId: razorpay_payment_id
    });

    if (existing) {
      console.warn(
        `⚠️ Payment ${razorpay_payment_id} already processed`
      );

      return res.json({
        success: true,
        message: 'This payment has already been processed',

        pdfUrl:
          existing.pdf?.cloudinaryUrl ||
          existing.pdf?.url,

        recordId: existing._id,
        scheduledTime: existing.scheduledTime,
        status: existing.status,

        whatsapp: {
          scheduled: existing.status === 'scheduled',
          scheduledTime: existing.scheduledTime,
          status: existing.status,
          recordId: existing._id
        },

        userDetails: {
          fullName: existing.userDetails?.fullName || fullName,
          email: existing.userDetails?.email || email || 'N/A',
          mobile: existing.userDetails?.mobile || mobile || 'N/A',
          city: existing.userDetails?.city || city || 'N/A'
        }
      });
    }

    // ========================================================
    // CHECK ASTROLOGY API KEY
    // ========================================================

    const headers = getAstrologyApiHeaders();

    if (!headers) {
      console.error('❌ ASTROLOGYAPI_KEY is missing');

      return res.status(401).json({
        success: false,
        message:
          'AstrologyAPI Key missing. Please add ASTROLOGYAPI_KEY to .env'
      });
    }

    // ========================================================
    // PREPARE ASTROLOGY API PREMIUM PDF REQUEST
    // ========================================================

    const pdfRequestBody = {
      name: fullName,

      gender: gender,

      day: parseInt(date, 10),
      month: parseInt(month, 10),
      year: parseInt(year, 10),

      hour: parseInt(hour, 10),
      min: parseInt(minute, 10),

      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),

      language: language,

      timezone: parseFloat(timezone),

      place: city || 'Unknown',

      chart_style: 'NORTH_INDIAN',

      footer_link:
        process.env.COMPANY_DOMAIN ||
        'nakshatraganak.com',

      logo_url:
        'https://nakshatraganak.com/assets/logo-BXY0wJwW.jpeg',

      company_name:
        process.env.COMPANY_NAME ||
        'Nakshatra Ganak',

      company_info:
        process.env.COMPANY_INFO ||
        'Vedic Astrology Services',

      domain_url:
        process.env.COMPANY_DOMAIN_URL ||
        'https://nakshatraganak.com',

      company_email:
        process.env.COMPANY_EMAIL ||
        'info@nakshatraganak.com',

      company_landline:
        process.env.COMPANY_LANDLINE ||
        '+91 99530 43676',

      company_mobile:
        process.env.COMPANY_MOBILE ||
        '+91 99530 43676'
    };

    console.log('==========================================');
    console.log('📤 SENDING PREMIUM PDF REQUEST TO ASTROLOGY API');
    console.log('==========================================');

    console.log(
      JSON.stringify(pdfRequestBody, null, 2)
    );

    // ========================================================
    // CALL ASTROLOGY API - PREMIUM ENDPOINT
    // ========================================================

    const response = await axios.post(
      `${ASTROLOGYAPI_PDF_BASE}/premium_kundli_report`,
      pdfRequestBody,
      {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },

        timeout: 90000 // premium report is ~150 pages, allow longer timeout
      }
    );

    // ========================================================
    // LOG ASTROLOGY API RESPONSE
    // ========================================================

    console.log('==========================================');
    console.log('📥 ASTROLOGY API PREMIUM RESPONSE');
    console.log('==========================================');

    console.log(
      JSON.stringify(response.data, null, 2)
    );

    // ========================================================
    // GET PDF URL
    // ========================================================

    const pdfUrl =
      response.data?.response?.pdf_url ||
      response.data?.pdf_url ||
      response.data?.url ||
      response.data?.data?.pdf_url ||
      response.data?.data?.url;

    if (!pdfUrl) {
      console.error(
        '❌ PDF URL NOT FOUND IN ASTROLOGY API RESPONSE'
      );

      return res.status(500).json({
        success: false,
        message:
          'PDF URL not found in AstrologyAPI response',

        astrologyResponse: response.data
      });
    }

    console.log('✅ Premium PDF generated successfully');
    console.log('📄 PDF URL:', pdfUrl);

    // ========================================================
    // UPLOAD PDF TO CLOUDINARY
    // ========================================================

    let cloudinaryUrl = pdfUrl;

    try {
      console.log('==========================================');
      console.log('📤 UPLOADING PREMIUM PDF TO CLOUDINARY');
      console.log('==========================================');

      const uploadResult =
        await cloudinary.uploader.upload(
          pdfUrl,
          {
            resource_type: 'raw',

            folder: 'premium_kundli_reports',

            public_id: `premium_kundli_${Date.now()}`,

            use_filename: true,

            unique_filename: true
          }
        );

      cloudinaryUrl = uploadResult.secure_url;

      console.log(
        '✅ Premium PDF uploaded to Cloudinary'
      );

      console.log(
        '☁️ Cloudinary URL:',
        cloudinaryUrl
      );

    } catch (uploadError) {
      console.warn(
        '⚠️ Cloudinary upload failed'
      );

      console.warn(
        uploadError?.message
      );

      console.warn(
        '⚠️ Using original AstrologyAPI PDF URL'
      );
    }

    // ========================================================
    // CREATE FILE NAME
    // ========================================================

    const safeName = String(fullName)
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '');

    const filename =
      `Premium_Kundli_${safeName || 'User'}.pdf`;

    // ========================================================
    // SCHEDULE WHATSAPP AFTER 10 MINUTES
    // ========================================================

    const scheduledTime =
      new Date(
        Date.now() + 10 * 60 * 1000
      );

    console.log('==========================================');
    console.log('📱 PREMIUM WHATSAPP SCHEDULING');
    console.log('==========================================');

    console.log(
      'Scheduled Time:',
      scheduledTime.toISOString()
    );

    // ========================================================
    // CREATE DATABASE RECORD
    // ========================================================

    let record;

    try {
      record = new ScheduledPremiumPdf({
        userDetails: {
          fullName: fullName,

          email: email || '',

          mobile: mobile,

          city: city || ''
        },

        pdf: {
          url: pdfUrl,

          cloudinaryUrl: cloudinaryUrl,

          filename: filename
        },

        paymentId:
          razorpay_payment_id,

        orderId:
          razorpay_order_id,

        status: 'scheduled',

        scheduledTime:
          scheduledTime,

        whatsappSent: false,

        attempts: 0,

        reportType: 'premium'
      });

      await record.save();

      console.log(
        '✅ Scheduled Premium PDF record saved'
      );

      console.log(
        'Record ID:',
        record._id
      );

    } catch (saveError) {
      // ======================================================
      // DUPLICATE PAYMENT
      // ======================================================

      if (saveError.code === 11000) {
        console.warn(
          '⚠️ Duplicate payment detected while saving'
        );

        const duplicate =
          await ScheduledPremiumPdf.findOne({
            paymentId: razorpay_payment_id
          });

        if (duplicate) {
          return res.json({
            success: true,

            message:
              'This payment has already been processed',

            pdfUrl:
              duplicate.pdf?.cloudinaryUrl ||
              duplicate.pdf?.url ||
              cloudinaryUrl,

            recordId: duplicate._id,

            scheduledTime:
              duplicate.scheduledTime,

            status:
              duplicate.status,

            whatsapp: {
              scheduled:
                duplicate.status === 'scheduled',

              scheduledTime:
                duplicate.scheduledTime,

              status:
                duplicate.status,

              recordId:
                duplicate._id
            },

            userDetails: {
              fullName:
                duplicate.userDetails?.fullName ||
                fullName,

              email:
                duplicate.userDetails?.email ||
                email ||
                'N/A',

              mobile:
                duplicate.userDetails?.mobile ||
                mobile ||
                'N/A',

              city:
                duplicate.userDetails?.city ||
                city ||
                'N/A'
            }
          });
        }
      }

      throw saveError;
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    console.log('==========================================');
    console.log('🎉 PREMIUM KUNDLI PROCESS COMPLETED');
    console.log('==========================================');

    console.log(
      `✅ WhatsApp scheduled for ${scheduledTime.toISOString()}`
    );

    return res.json({
      success: true,

      pdfUrl: cloudinaryUrl,

      message:
        'Premium PDF generated! WhatsApp will be sent in 10 minutes',

      recordId:
        record._id,

      scheduledTime:
        scheduledTime,

      whatsapp: {
        scheduled: true,

        scheduledTime:
          scheduledTime,

        status: 'scheduled',

        recordId:
          record._id
      },

      userDetails: {
        fullName:
          fullName,

        email:
          email || 'N/A',

        mobile:
          mobile || 'N/A',

        city:
          city || 'N/A'
      }
    });

  } catch (error) {

    console.error('==========================================');
    console.error('❌ PREMIUM GENERATE-AND-SCHEDULE ERROR');
    console.error('==========================================');

    console.error(
      'Message:',
      error?.message
    );

    console.error(
      'Status:',
      error?.response?.status
    );

    console.error(
      'Response:',
      JSON.stringify(
        error?.response?.data,
        null,
        2
      )
    );

    console.error(
      'Stack:',
      error?.stack
    );

    // ========================================================
    // ASTROLOGY API BAD REQUEST
    // ========================================================

    if (
      error?.response?.status === 400
    ) {
      return res.status(400).json({
        success: false,

        message:
          error?.response?.data?.message ||
          'Bad Request from AstrologyAPI. Please check birth details.',

        error:
          error?.response?.data ||
          error?.message
      });
    }

    // ========================================================
    // ASTROLOGY API AUTH ERROR
    // ========================================================

    if (
      error?.response?.status === 401 ||
      error?.response?.status === 403
    ) {
      return res.status(401).json({
        success: false,

        message:
          'Invalid AstrologyAPI Key. Please check ASTROLOGYAPI_KEY in .env'
      });
    }

    // ========================================================
    // ASTROLOGY API RATE LIMIT
    // ========================================================

    if (
      error?.response?.status === 429
    ) {
      return res.status(429).json({
        success: false,

        message:
          'AstrologyAPI rate limit reached. Please try again later.'
      });
    }

    // ========================================================
    // TIMEOUT
    // ========================================================

    if (
      error?.code === 'ECONNABORTED' ||
      error?.code === 'ETIMEDOUT'
    ) {
      return res.status(504).json({
        success: false,

        message:
          'AstrologyAPI request timed out. Premium reports take longer. Please try again.'
      });
    }

    // ========================================================
    // DEFAULT
    // ========================================================

    return res.status(502).json({
      success: false,

      message:
        error?.response?.data?.message ||
        'Failed to generate Premium PDF from AstrologyAPI',

      error:
        error?.message
    });
  }
});

// ============================================================
// GENERATE PREMIUM PDF ONLY
// NO WHATSAPP SCHEDULING
// ============================================================

router.post('/generate', async (req, res) => {
  try {

    const {
      date,
      month,
      year,
      hour,
      minute,
      latitude,
      longitude,
      timezone = 5.5,

      fullName,
      email,
      mobile,
      city,
      gender = 'male',
      language = 'en'
    } = req.body;

    // ========================================================
    // VALIDATE
    // ========================================================

    if (
      !date ||
      !month ||
      !year ||
      hour === undefined ||
      minute === undefined ||
      latitude === undefined ||
      longitude === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Missing required birth details'
      });
    }

    if (!fullName) {
      return res.status(400).json({
        success: false,
        message:
          'Full name is required'
      });
    }

    // ========================================================
    // API HEADERS
    // ========================================================

    const headers =
      getAstrologyApiHeaders();

    if (!headers) {
      return res.status(401).json({
        success: false,

        message:
          'AstrologyAPI Key missing in .env file'
      });
    }

    // ========================================================
    // REQUEST BODY
    // ========================================================

    const pdfRequestBody = {
      name: fullName,

      gender: gender,

      day: parseInt(date, 10),

      month: parseInt(month, 10),

      year: parseInt(year, 10),

      hour: parseInt(hour, 10),

      min: parseInt(minute, 10),

      latitude: parseFloat(latitude),

      longitude: parseFloat(longitude),

      language: language,

      timezone: parseFloat(timezone),

      place: city || 'Unknown',

      chart_style:
        'NORTH_INDIAN',

      footer_link:
        process.env.COMPANY_DOMAIN ||
        'nakshatraganak.com',

      logo_url:
        'https://nakshatraganak.com/assets/logo-BXY0wJwW.jpeg',

      company_name:
        process.env.COMPANY_NAME ||
        'Nakshatra Ganak',

      company_info:
        process.env.COMPANY_INFO ||
        'Vedic Astrology Services',

      domain_url:
        process.env.COMPANY_DOMAIN_URL ||
        'https://nakshatraganak.com',

      company_email:
        process.env.COMPANY_EMAIL ||
        'info@nakshatraganak.com',

      company_landline:
        process.env.COMPANY_LANDLINE ||
        '+91 99530 43676',

      company_mobile:
        process.env.COMPANY_MOBILE ||
        '+91 99530 43676'
    };

    console.log(
      '📤 AstrologyAPI Premium PDF Request:',
      JSON.stringify(
        pdfRequestBody,
        null,
        2
      )
    );

    // ========================================================
    // CALL ASTROLOGY API - PREMIUM ENDPOINT
    // ========================================================

    const response = await axios.post(
      `${ASTROLOGYAPI_PDF_BASE}/premium_kundli_report`,

      pdfRequestBody,

      {
        headers: {
          ...headers,

          'Content-Type':
            'application/json'
        },

        timeout: 90000
      }
    );

    // ========================================================
    // LOG RESPONSE
    // ========================================================

    console.log(
      '📥 AstrologyAPI Premium PDF Response:',
      JSON.stringify(
        response.data,
        null,
        2
      )
    );

    // ========================================================
    // GET PDF URL
    // ========================================================

    const pdfUrl =
      response.data?.response?.pdf_url ||
      response.data?.pdf_url ||
      response.data?.url ||
      response.data?.data?.pdf_url ||
      response.data?.data?.url;

    if (!pdfUrl) {

      console.error(
        '❌ No PDF URL in response'
      );

      return res.status(500).json({
        success: false,

        message:
          'PDF URL not found in response',

        astrologyResponse:
          response.data
      });
    }

    console.log(
      '✅ Premium PDF generated successfully'
    );

    return res.json({
      success: true,

      pdfUrl: pdfUrl,

      message:
        'Premium PDF generated successfully',

      userDetails: {
        fullName:
          fullName,

        email:
          email || 'N/A',

        mobile:
          mobile || 'N/A',

        city:
          city || 'N/A'
      }
    });

  } catch (error) {

    console.error(
      '=========================================='
    );

    console.error(
      '❌ ASTROLOGYAPI PREMIUM PDF ERROR'
    );

    console.error(
      '=========================================='
    );

    console.error(
      'Status:',
      error?.response?.status
    );

    console.error(
      'Response:',
      JSON.stringify(
        error?.response?.data,
        null,
        2
      )
    );

    console.error(
      'Message:',
      error?.message
    );

    // ========================================================
    // BAD REQUEST
    // ========================================================

    if (
      error?.response?.status === 400
    ) {
      return res.status(400).json({
        success: false,

        message:
          error?.response?.data?.message ||
          'Bad Request: Please check your input parameters'
      });
    }

    // ========================================================
    // AUTH ERROR
    // ========================================================

    if (
      error?.response?.status === 401 ||
      error?.response?.status === 403
    ) {
      return res.status(401).json({
        success: false,

        message:
          'Invalid AstrologyAPI Key. Please check your key.'
      });
    }

    // ========================================================
    // RATE LIMIT
    // ========================================================

    if (
      error?.response?.status === 429
    ) {
      return res.status(429).json({
        success: false,

        message:
          'AstrologyAPI rate limit reached. Please try again later.'
      });
    }

    // ========================================================
    // TIMEOUT
    // ========================================================

    if (
      error?.code === 'ECONNABORTED' ||
      error?.code === 'ETIMEDOUT'
    ) {
      return res.status(504).json({
        success: false,

        message:
          'AstrologyAPI request timed out. Premium reports take longer.'
      });
    }

    // ========================================================
    // DEFAULT
    // ========================================================

    return res.status(502).json({
      success: false,

      message:
        error?.response?.data?.message ||
        'Failed to generate Premium PDF from AstrologyAPI',

      error:
        error?.message
    });
  }
});

// ============================================================
// GET SCHEDULED PREMIUM PDF / WHATSAPP STATUS
// ============================================================

router.get(
  '/status/:recordId',
  async (req, res) => {

    try {

      const record =
        await ScheduledPremiumPdf.findById(
          req.params.recordId
        );

      if (!record) {
        return res.status(404).json({
          success: false,

          message:
            'Record not found'
        });
      }

      return res.json({
        success: true,

        status:
          record.status,

        sentAt:
          record.sentAt,

        whatsappSent:
          record.whatsappSent,

        scheduledTime:
          record.scheduledTime,

        error:
          record.error ||
          record.whatsappError ||
          null
      });

    } catch (error) {

      console.error(
        '❌ Premium status check error:',
        error
      );

      return res.status(500).json({
        success: false,

        message:
          'Failed to get status',

        error:
          error?.message
      });
    }
  }
);

// ============================================================
// EXPORT
// ============================================================

module.exports = router;