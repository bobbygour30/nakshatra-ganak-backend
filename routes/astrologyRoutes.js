const express = require('express');
const router = express.Router();
const axios = require('axios');

// ============================================================
//  ASTROLOGYAPI.COM PDF CONFIGURATION
// ============================================================
const ASTROLOGYAPI_PDF_BASE = 'https://pdf.astrologyapi.com/v1';
const ASTROLOGYAPI_KEY = process.env.ASTROLOGYAPI_KEY;

console.log('=================================');
console.log('🔥 AstrologyAPI.com PDF Configuration');
console.log('API Key:', ASTROLOGYAPI_KEY ? '✅ Set' : '❌ Missing');
console.log('PDF URL :', ASTROLOGYAPI_PDF_BASE);
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
//  GENERATE PDF HOROSCOPE (AstrologyAPI PDF)
// ============================================================
router.post('/generate', async (req, res) => {
  try {
    const { 
      date, month, year, hour, minute, latitude, longitude, timezone = 5.5,
      fullName, email, mobile, city, gender = 'male'
    } = req.body;

    // Validate required fields
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

    // Prepare PDF request body as per AstrologyAPI documentation
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
      language: 'en',
      tzone: parseFloat(timezone),
      place: city || 'Unknown',
      chart_style: 'NORTH_INDIAN',
      footer_link: process.env.COMPANY_DOMAIN || 'nakshatraganak.com',
      logo_url: process.env.COMPANY_LOGO_URL || '',
      company_name: process.env.COMPANY_NAME || 'Nakshatra Ganak',
      company_info: process.env.COMPANY_INFO || 'Vedic Astrology Services',
      domain_url: process.env.COMPANY_DOMAIN_URL || 'https://nakshatraganak.com',
      company_email: process.env.COMPANY_EMAIL || 'info@nakshatraganak.com',
      company_landline: process.env.COMPANY_LANDLINE || '',
      company_mobile: process.env.COMPANY_MOBILE || ''
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
        timeout: 60000 // 60 seconds for PDF generation
      }
    );

    console.log('✅ PDF generated successfully');

    // The API returns a PDF URL
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