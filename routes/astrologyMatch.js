const express = require('express');
const router = express.Router();
const axios = require('axios');

// ============================================================
//  ASTROLOGYAPI.COM CONFIGURATION
// ============================================================
const ASTROLOGYAPI_BASE = 'https://json.astrologyapi.com/v1';
const ASTROLOGYAPI_KEY = process.env.ASTROLOGYAPI_KEY;

console.log('=================================');
console.log('🔮 AstrologyAPI.com Match & Panchang Configuration');
console.log('API Key:', ASTROLOGYAPI_KEY ? '✅ Set' : '❌ Missing');
console.log('=================================');

const getAstrologyApiHeaders = () => {
  if (!ASTROLOGYAPI_KEY) {
    throw new Error('AstrologyAPI Key is missing');
  }
  return {
    'x-astrologyapi-key': ASTROLOGYAPI_KEY,
    'Content-Type': 'application/json',
    'Accept-Language': 'en' // Default to English
  };
};

// ============================================================
//  HELPER: Validate birth details
// ============================================================
const validateBirthDetails = (data, prefix = '') => {
  const errors = [];
  
  const day = data[`${prefix}day`];
  const month = data[`${prefix}month`];
  const year = data[`${prefix}year`];
  const hour = data[`${prefix}hour`];
  const min = data[`${prefix}min`];
  const lat = data[`${prefix}lat`];
  const lon = data[`${prefix}lon`];
  const tzone = data[`${prefix}tzone`];

  if (day === undefined || day === null) errors.push(`${prefix}day is required`);
  if (month === undefined || month === null) errors.push(`${prefix}month is required`);
  if (year === undefined || year === null) errors.push(`${prefix}year is required`);
  if (hour === undefined || hour === null) errors.push(`${prefix}hour is required`);
  if (min === undefined || min === null) errors.push(`${prefix}min is required`);
  if (lat === undefined || lat === null) errors.push(`${prefix}lat is required`);
  if (lon === undefined || lon === null) errors.push(`${prefix}lon is required`);
  if (tzone === undefined || tzone === null) errors.push(`${prefix}tzone is required`);

  return errors;
};

// ============================================================
//  1. MATCH ASTRO DETAILS API
// ============================================================
router.post('/match-astro-details', async (req, res) => {
  try {
    const {
      // Male details
      m_day, m_month, m_year, m_hour, m_min, m_lat, m_lon, m_tzone,
      // Female details
      f_day, f_month, f_year, f_hour, f_min, f_lat, f_lon, f_tzone,
      // Optional
      language = 'en'
    } = req.body;

    // Validate all required fields
    const maleErrors = validateBirthDetails({ 
      m_day, m_month, m_year, m_hour, m_min, m_lat, m_lon, m_tzone 
    }, 'm_');
    const femaleErrors = validateBirthDetails({ 
      f_day, f_month, f_year, f_hour, f_min, f_lat, f_lon, f_tzone 
    }, 'f_');

    const allErrors = [...maleErrors, ...femaleErrors];
    if (allErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        errors: allErrors
      });
    }

    // Build request body
    const requestBody = {
      m_day: parseInt(m_day),
      m_month: parseInt(m_month),
      m_year: parseInt(m_year),
      m_hour: parseInt(m_hour),
      m_min: parseInt(m_min),
      m_lat: parseFloat(m_lat),
      m_lon: parseFloat(m_lon),
      m_tzone: parseFloat(m_tzone),
      f_day: parseInt(f_day),
      f_month: parseInt(f_month),
      f_year: parseInt(f_year),
      f_hour: parseInt(f_hour),
      f_min: parseInt(f_min),
      f_lat: parseFloat(f_lat),
      f_lon: parseFloat(f_lon),
      f_tzone: parseFloat(f_tzone)
    };

    console.log('📤 Fetching match astro details...');
    console.log('Male:', { day: m_day, month: m_month, year: m_year });
    console.log('Female:', { day: f_day, month: f_month, year: f_year });

    const headers = getAstrologyApiHeaders();
    headers['Accept-Language'] = language;

    const response = await axios.post(
      `${ASTROLOGYAPI_BASE}/match_astro_details`,
      requestBody,
      {
        headers: headers,
        timeout: 30000
      }
    );

    console.log('✅ Match astro details fetched successfully');

    return res.json({
      success: true,
      data: response.data,
      message: 'Match astro details retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error in match-astro-details:', error);
    
    if (error.response?.status === 400) {
      return res.status(400).json({
        success: false,
        message: 'Bad Request: Please check your input parameters',
        error: error.response?.data
      });
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({
        success: false,
        message: 'Invalid AstrologyAPI Key. Please check your key.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch match astro details',
      error: error.message
    });
  }
});

// ============================================================
//  2. LOVE COMPATIBILITY REPORT API
// ============================================================
router.post('/love-compatibility', async (req, res) => {
  try {
    const {
      // Person 1 (Primary)
      p_day, p_month, p_year, p_hour, p_min, p_lat, p_lon, p_tzone,
      // Person 2 (Secondary)
      s_day, s_month, s_year, s_hour, s_min, s_lat, s_lon, s_tzone,
      // Optional
      language = 'en'
    } = req.body;

    // Validate
    const pErrors = validateBirthDetails({ 
      p_day, p_month, p_year, p_hour, p_min, p_lat, p_lon, p_tzone 
    }, 'p_');
    const sErrors = validateBirthDetails({ 
      s_day, s_month, s_year, s_hour, s_min, s_lat, s_lon, s_tzone 
    }, 's_');

    const allErrors = [...pErrors, ...sErrors];
    if (allErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        errors: allErrors
      });
    }

    // Build request body
    const requestBody = {
      p_day: parseInt(p_day),
      p_month: parseInt(p_month),
      p_year: parseInt(p_year),
      p_hour: parseInt(p_hour),
      p_min: parseInt(p_min),
      p_lat: parseFloat(p_lat),
      p_lon: parseFloat(p_lon),
      p_tzone: parseFloat(p_tzone),
      s_day: parseInt(s_day),
      s_month: parseInt(s_month),
      s_year: parseInt(s_year),
      s_hour: parseInt(s_hour),
      s_min: parseInt(s_min),
      s_lat: parseFloat(s_lat),
      s_lon: parseFloat(s_lon),
      s_tzone: parseFloat(s_tzone)
    };

    console.log('📤 Fetching love compatibility report...');
    console.log('Person 1:', { day: p_day, month: p_month, year: p_year });
    console.log('Person 2:', { day: s_day, month: s_month, year: s_year });

    const headers = getAstrologyApiHeaders();
    headers['Accept-Language'] = language;

    const response = await axios.post(
      `${ASTROLOGYAPI_BASE}/love_compatibility_report/tropical`,
      requestBody,
      {
        headers: headers,
        timeout: 30000
      }
    );

    console.log('✅ Love compatibility report fetched successfully');

    return res.json({
      success: true,
      data: response.data,
      message: 'Love compatibility report retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error in love-compatibility:', error);
    
    if (error.response?.status === 400) {
      return res.status(400).json({
        success: false,
        message: 'Bad Request: Please check your input parameters',
        error: error.response?.data
      });
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({
        success: false,
        message: 'Invalid AstrologyAPI Key. Please check your key.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch love compatibility report',
      error: error.message
    });
  }
});

// ============================================================
//  3. ADVANCED PANCHANG API
// ============================================================
router.post('/advanced-panchang', async (req, res) => {
  try {
    const {
      day, month, year, hour, min, lat, lon, tzone = 5.5,
      language = 'en'
    } = req.body;

    // Validate
    const errors = validateBirthDetails({ day, month, year, hour, min, lat, lon, tzone });
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        errors: errors
      });
    }

    // Build request body
    const requestBody = {
      day: parseInt(day),
      month: parseInt(month),
      year: parseInt(year),
      hour: parseInt(hour),
      min: parseInt(min),
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      tzone: parseFloat(tzone)
    };

    console.log('📤 Fetching advanced panchang...');
    console.log('Date:', `${day}/${month}/${year}`, 'Time:', `${hour}:${min}`);

    const headers = getAstrologyApiHeaders();
    headers['Accept-Language'] = language;

    const response = await axios.post(
      `${ASTROLOGYAPI_BASE}/advanced_panchang`,
      requestBody,
      {
        headers: headers,
        timeout: 30000
      }
    );

    console.log('✅ Advanced panchang fetched successfully');

    return res.json({
      success: true,
      data: response.data,
      message: 'Advanced panchang retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error in advanced-panchang:', error);
    
    if (error.response?.status === 400) {
      return res.status(400).json({
        success: false,
        message: 'Bad Request: Please check your input parameters',
        error: error.response?.data
      });
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({
        success: false,
        message: 'Invalid AstrologyAPI Key. Please check your key.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch advanced panchang',
      error: error.message
    });
  }
});

// ============================================================
//  HEALTH CHECK ENDPOINT
// ============================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Astrology match API is running',
    endpoints: [
      'POST /api/astrology/match-astro-details',
      'POST /api/astrology/love-compatibility',
      'POST /api/astrology/advanced-panchang'
    ]
  });
});

module.exports = router;