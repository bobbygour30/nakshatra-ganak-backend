const express = require('express');
const router = express.Router();
const axios = require('axios');
const ScheduledPdf = require('../models/ScheduledPdf');
const cloudinary = require('cloudinary').v2;
const { sendWhatsApp } = require('./whatsapp'); // Import the send function

// ============================================================
//  ASTROLOGYAPI.COM PDF CONFIGURATION
// ============================================================
const ASTROLOGYAPI_PDF_BASE = 'https://pdf.astrologyapi.com/v1';
const ASTROLOGYAPI_KEY = process.env.ASTROLOGYAPI_KEY;

console.log('=================================');
console.log('🔥 AstrologyAPI.com PDF Configuration');
console.log('API Key:', ASTROLOGYAPI_KEY ? '✅ Set' : '❌ Missing');
console.log('PDF URL :', ASTROLOGYAPI_PDF_BASE);
console.log('Mode    : INSTANT SEND (No Cron)');
console.log('=================================');

const getAstrologyApiHeaders = () => {
  if (!ASTROLOGYAPI_KEY) return null;
  return {
    'x-astrologyapi-key': ASTROLOGYAPI_KEY,
    'Content-Type': 'application/json',
    'Accept-Language': 'en'
  };
};

// ============================================================
//  GENERATE PDF AND SEND WHATSAPP INSTANTLY
// ============================================================
router.post('/generate-and-send', async (req, res) => {
  try {
    const { 
      date, month, year, hour, minute, latitude, longitude, timezone = 5.5,
      fullName, email, mobile, city, gender = 'male',
      language = 'en'
    } = req.body;

    // Validate
    if (!date || !month || !year || hour === undefined || !latitude || !longitude || !fullName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    if (!mobile || mobile.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Valid 10-digit mobile number is required for WhatsApp delivery'
      });
    }

    // 1. Generate PDF
    const headers = getAstrologyApiHeaders();
    if (!headers) {
      return res.status(401).json({
        success: false,
        message: 'AstrologyAPI Key missing'
      });
    }

    const pdfRequestBody = {
      name: fullName,
      gender: gender,
      day: parseInt(date),
      month: parseInt(month),
      year: parseInt(year),
      hour: parseInt(hour),
      min: parseInt(minute),
      lat: parseFloat(latitude),
      lon: parseFloat(longitude),
      language: language,
      tzone: parseFloat(timezone),
      place: city || 'Unknown',
      chart_style: 'NORTH_INDIAN',
      footer_link: process.env.COMPANY_DOMAIN || 'nakshatraganak.com',
      logo_url: 'https://nakshatraganak.com/assets/logo-BXY0wJwW.jpeg',
      company_name: process.env.COMPANY_NAME || 'Nakshatra Ganak',
      company_info: process.env.COMPANY_INFO || 'Vedic Astrology Services',
      domain_url: process.env.COMPANY_DOMAIN_URL || 'https://nakshatraganak.com',
      company_email: process.env.COMPANY_EMAIL || 'info@nakshatraganak.com',
      company_mobile: process.env.COMPANY_MOBILE || '+91 99530 43676',
    };

    console.log('📤 Generating PDF for:', fullName);
    const response = await axios.post(
      `${ASTROLOGYAPI_PDF_BASE}/basic_horoscope_pdf`,
      pdfRequestBody,
      { 
        headers: { ...headers, 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );

    const pdfUrl = response.data?.pdf_url || response.data?.url;
    if (!pdfUrl) {
      return res.status(500).json({
        success: false,
        message: 'PDF URL not found in response'
      });
    }
    console.log('✅ PDF generated');

    // 2. Upload to Cloudinary
    let cloudinaryUrl = pdfUrl;
    try {
      console.log('📤 Uploading to Cloudinary...');
      const uploadResult = await cloudinary.uploader.upload(pdfUrl, {
        resource_type: 'raw',
        folder: 'kundli_reports',
        public_id: `kundli_${Date.now()}`,
        use_filename: true,
        unique_filename: true
      });
      cloudinaryUrl = uploadResult.secure_url;
      console.log('✅ Uploaded to Cloudinary');
    } catch (uploadError) {
      console.warn('⚠️ Cloudinary upload failed, using original URL');
    }

    // 3. SEND WHATSAPP INSTANTLY (NO CRON, NO SCHEDULING)
    let whatsappResult = { sent: false, error: null, recordId: null };
    
    try {
      console.log(`📤 Sending WhatsApp to ${mobile} instantly...`);
      
      const filename = `Kundli_${fullName.replace(/\s/g, '_')}.pdf`;
      
      // Use the sendWhatsApp function
      const result = await sendWhatsApp(
        mobile,
        cloudinaryUrl,
        filename,
        fullName
      );

      // Log success in database
      const record = new ScheduledPdf({
        userDetails: {
          fullName,
          email: email || '',
          mobile: mobile,
          city: city || ''
        },
        pdf: {
          url: pdfUrl,
          cloudinaryUrl: cloudinaryUrl,
          filename: filename
        },
        status: 'sent',
        sentAt: new Date(),
        whatsappSent: true,
        attempts: 1
      });
      await record.save();

      whatsappResult = {
        sent: true,
        error: null,
        recordId: record._id
      };
      
      console.log('✅ WhatsApp sent instantly!');

    } catch (whatsappError) {
      console.error('❌ WhatsApp send failed:', whatsappError.message);
      
      // Log failure in database
      try {
        const record = new ScheduledPdf({
          userDetails: {
            fullName,
            email: email || '',
            mobile: mobile,
            city: city || ''
          },
          pdf: {
            url: pdfUrl,
            cloudinaryUrl: cloudinaryUrl,
            filename: `Kundli_${fullName.replace(/\s/g, '_')}.pdf`
          },
          status: 'failed',
          whatsappSent: false,
          whatsappError: whatsappError.message,
          attempts: 1,
          error: whatsappError.message
        });
        await record.save();
        
        whatsappResult = {
          sent: false,
          error: whatsappError.message,
          recordId: record._id
        };
      } catch (logError) {
        console.error('Failed to log error:', logError);
      }
    }

    // 4. Return response with WhatsApp status
    return res.json({
      success: true,
      pdfUrl: cloudinaryUrl,
      message: 'PDF generated successfully',
      whatsapp: {
        sent: whatsappResult.sent,
        error: whatsappResult.error,
        recordId: whatsappResult.recordId,
        delivered: whatsappResult.sent ? 'instantly' : 'failed'
      },
      userDetails: {
        fullName,
        email: email || 'N/A',
        mobile: mobile || 'N/A',
        city: city || 'N/A'
      }
    });

  } catch (error) {
    console.error('❌ Error in generate-and-send:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate PDF',
      error: error.message
    });
  }
});

// ============================================================
//  GENERATE PDF ONLY (No WhatsApp)
// ============================================================
router.post('/generate', async (req, res) => {
  try {
    const { 
      date, month, year, hour, minute, latitude, longitude, timezone = 5.5,
      fullName, email, mobile, city, gender = 'male',
      language = 'en'
    } = req.body;

    if (!date || !month || !year || hour === undefined || minute === undefined || !latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Missing required birth details' });
    }

    if (!fullName) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }

    const headers = getAstrologyApiHeaders();
    if (!headers) {
      return res.status(401).json({
        success: false,
        message: 'AstrologyAPI Key missing in .env file'
      });
    }

    const pdfRequestBody = {
      name: fullName,
      gender: gender,
      day: parseInt(date),
      month: parseInt(month),
      year: parseInt(year),
      hour: parseInt(hour),
      min: parseInt(minute),
      lat: parseFloat(latitude),
      lon: parseFloat(longitude),
      language: language,
      tzone: parseFloat(timezone),
      place: city || 'Unknown',
      chart_style: 'NORTH_INDIAN',
      footer_link: process.env.COMPANY_DOMAIN || 'nakshatraganak.com',
      logo_url: 'https://nakshatraganak.com/assets/logo-BXY0wJwW.jpeg',
      company_name: process.env.COMPANY_NAME || 'Nakshatra Ganak',
      company_info: process.env.COMPANY_INFO || 'Vedic Astrology Services',
      domain_url: process.env.COMPANY_DOMAIN_URL || 'https://nakshatraganak.com',
      company_email: process.env.COMPANY_EMAIL || 'info@nakshatraganak.com',
      company_mobile: process.env.COMPANY_MOBILE || '+91 99530 43676',
    };

    console.log('📤 AstrologyAPI PDF Request:', JSON.stringify(pdfRequestBody, null, 2));

    const response = await axios.post(
      `${ASTROLOGYAPI_PDF_BASE}/basic_horoscope_pdf`,
      pdfRequestBody,
      { 
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    console.log('✅ PDF generated successfully');

    const pdfUrl = response.data?.pdf_url || response.data?.url || response.data?.data?.pdf_url;

    if (!pdfUrl) {
      console.error('No PDF URL in response:', response.data);
      return res.status(500).json({
        success: false,
        message: 'PDF URL not found in response'
      });
    }

    return res.json({
      success: true,
      pdfUrl: pdfUrl,
      message: 'PDF generated successfully',
      userDetails: {
        fullName: fullName,
        email: email || 'N/A',
        mobile: mobile || 'N/A',
        city: city || 'N/A'
      }
    });

  } catch (error) {
    console.error('=== ASTROLOGYAPI PDF ERROR ===');
    console.error('Status:', error.response?.status);
    console.error('Response:', JSON.stringify(error.response?.data, null, 2));
    console.error('Message:', error.message);

    if (error.response?.status === 400) {
      return res.status(400).json({
        success: false,
        message: 'Bad Request: Please check your input parameters for PDF generation'
      });
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({
        success: false,
        message: 'Invalid AstrologyAPI Key. Please check your key.'
      });
    }

    return res.status(502).json({
      success: false,
      message: error.response?.data?.message || 'Failed to generate PDF from AstrologyAPI'
    });
  }
});

module.exports = router;