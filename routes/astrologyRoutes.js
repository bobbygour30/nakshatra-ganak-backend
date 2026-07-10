const express = require('express');
const router = express.Router();
const axios = require('axios');

// ============================================================
//  ASTROLOGYAPI.COM CONFIGURATION
// ============================================================
const ASTROLOGYAPI_BASE = 'https://json.astrologyapi.com/v1';
const ASTROLOGYAPI_KEY = process.env.ASTROLOGYAPI_KEY;

console.log('=================================');
console.log('🔥 AstrologyAPI.com Configuration');
console.log('API Key:', ASTROLOGYAPI_KEY ? '✅ Set' : '❌ Missing');
console.log('Base URL :', ASTROLOGYAPI_BASE);
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
//  HELPER: Safely extract value from nested objects
// ============================================================
const safeGetValue = (obj, path, defaultValue = 'N/A') => {
  if (!obj) return defaultValue;
  
  const keys = Array.isArray(path) ? path : path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) return defaultValue;
    if (typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return defaultValue;
    }
  }
  
  if (current === null || current === undefined) return defaultValue;
  if (typeof current === 'object') {
    if (current.name) return String(current.name);
    if (current.value) return String(current.value);
    if (current.text) return String(current.text);
    if (current.display) return String(current.display);
    if (current.details) {
      if (current.details.tithi_name) return String(current.details.tithi_name);
      if (current.details.nak_name) return String(current.details.nak_name);
      if (current.details.yog_name) return String(current.details.yog_name);
      if (current.details.karan_name) return String(current.details.karan_name);
      if (current.details.ruler) return String(current.details.ruler);
      if (current.details.lord) return String(current.details.lord);
      if (current.details.deity) return String(current.details.deity);
    }
    if (current.start !== undefined && current.end !== undefined) {
      return `${current.start} - ${current.end}`;
    }
    try {
      const str = JSON.stringify(current);
      return str.length > 50 ? defaultValue : str;
    } catch {
      return defaultValue;
    }
  }
  return String(current);
};

// ============================================================
//  GENERATE PANCHANG (AstrologyAPI.com)
// ============================================================
router.post('/generate', async (req, res) => {
  try {
    const { date, month, year, hour, minute, latitude, longitude, timezone = 5.5 } = req.body;

    if (!date || !month || !year || hour === undefined || minute === undefined || !latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const requestBody = {
      day: parseInt(date),
      month: parseInt(month),
      year: parseInt(year),
      hour: parseInt(hour),
      min: parseInt(minute),
      lat: parseFloat(latitude),
      lon: parseFloat(longitude),
      tzone: parseFloat(timezone)
    };

    console.log('📤 AstrologyAPI Request:', JSON.stringify(requestBody, null, 2));

    const headers = getAstrologyApiHeaders();
    if (!headers) {
      return res.status(401).json({
        success: false,
        message: 'AstrologyAPI Key missing in .env file'
      });
    }

    const response = await axios.post(
      `${ASTROLOGYAPI_BASE}/advanced_panchang`,
      requestBody,
      { headers, timeout: 30000 }
    );

    console.log('✅ AstrologyAPI responded successfully');
    const data = response.data;

    const panchangData = {
      day: data.day || 'N/A',
      weekday: data.weekday || 'N/A',
      sunrise: data.sunrise || 'N/A',
      sunset: data.sunset || 'N/A',
      moonrise: data.moonrise || 'N/A',
      moonset: data.moonset || 'N/A',
      vedicSunrise: data.vedic_sunrise || 'N/A',
      vedicSunset: data.vedic_sunset || 'N/A',
      tithi: safeGetValue(data, 'tithi.details.tithi_name', 'N/A'),
      tithiNumber: safeGetValue(data, 'tithi.details.tithi_number', 'N/A'),
      tithiSpecial: safeGetValue(data, 'tithi.details.special', 'N/A'),
      tithiSummary: safeGetValue(data, 'tithi.details.summary', 'N/A'),
      tithiDeity: safeGetValue(data, 'tithi.details.deity', 'N/A'),
      tithiEnd: data.tithi?.end_time ? `${data.tithi.end_time.hour}:${data.tithi.end_time.minute}:${data.tithi.end_time.second}` : 'N/A',
      nakshatra: safeGetValue(data, 'nakshatra.details.nak_name', 'N/A'),
      nakshatraNumber: safeGetValue(data, 'nakshatra.details.nak_number', 'N/A'),
      nakshatraRuler: safeGetValue(data, 'nakshatra.details.ruler', 'N/A'),
      nakshatraDeity: safeGetValue(data, 'nakshatra.details.deity', 'N/A'),
      nakshatraSpecial: safeGetValue(data, 'nakshatra.details.special', 'N/A'),
      nakshatraSummary: safeGetValue(data, 'nakshatra.details.summary', 'N/A'),
      nakshatraEnd: data.nakshatra?.end_time ? `${data.nakshatra.end_time.hour}:${data.nakshatra.end_time.minute}:${data.nakshatra.end_time.second}` : 'N/A',
      yog: safeGetValue(data, 'yog.details.yog_name', 'N/A'),
      yogDeity: safeGetValue(data, 'yog.details.deity', 'N/A'),
      karan: safeGetValue(data, 'karan.details.karan_name', 'N/A'),
      karanDeity: safeGetValue(data, 'karan.details.deity', 'N/A'),
      paksha: data.paksha || 'N/A',
      ritu: data.ritu || 'N/A',
      ayana: data.ayana || 'N/A',
      hinduMaah: data.hindu_maah || 'N/A',
      sunSign: data.sun_sign || 'N/A',
      moonSign: data.moon_sign || 'N/A',
      vikramSamvat: data.vikram_samvat || 'N/A',
      shakaSamvat: data.shaka_samvat || 'N/A',
      abhijitMuhurta: data.abhijit_muhurta ? 
        (typeof data.abhijit_muhurta === 'string' ? data.abhijit_muhurta : 
         `${data.abhijit_muhurta.start} - ${data.abhijit_muhurta.end}`) : 'N/A',
      rahuKaal: data.rahukaal?.start && data.rahukaal?.end ? 
        `${data.rahukaal.start} - ${data.rahukaal.end}` : 'N/A',
      yamaganda: data.yamghant_kaal?.start && data.yamghant_kaal?.end ? 
        `${data.yamghant_kaal.start} - ${data.yamghant_kaal.end}` : 'N/A',
      gulika: data.guliKaal?.start && data.guliKaal?.end ? 
        `${data.guliKaal.start} - ${data.guliKaal.end}` : 'N/A',
      dishaShool: data.disha_shool || 'N/A',
      dishaShoolRemedies: data.disha_shool_remedies || 'N/A',
      nakShool: data.nak_shool || 'N/A',
      moonNivas: data.moon_nivas || 'N/A',
      _raw: data
    };

    const kundliData = {
      moonSign: data.moon_sign || 'N/A',
      nakshatra: safeGetValue(data, 'nakshatra.details.nak_name', 'N/A'),
      tithi: safeGetValue(data, 'tithi.details.tithi_name', 'N/A'),
      yoga: safeGetValue(data, 'yog.details.yog_name', 'N/A'),
      karana: safeGetValue(data, 'karan.details.karan_name', 'N/A'),
      paksha: data.paksha || 'N/A',
      ritu: data.ritu || 'N/A',
      ayana: data.ayana || 'N/A',
      sunSign: data.sun_sign || 'N/A'
    };

    console.log('✅ Panchang mapped successfully');
    console.log('🔹 Tithi:', panchangData.tithi);
    console.log('🔹 Nakshatra:', panchangData.nakshatra);
    console.log('🔹 Moon Sign:', panchangData.moonSign);

    return res.json({
      success: true,
      kundli: kundliData,
      panchang: panchangData
    });

  } catch (error) {
    console.error('=== ASTROLOGYAPI ERROR ===');
    console.error('Status:', error.response?.status);
    console.error('Response:', JSON.stringify(error.response?.data, null, 2));
    console.error('Message:', error.message);

    if (error.response?.status === 400) {
      return res.status(400).json({
        success: false,
        message: 'Bad Request: Please check your input parameters'
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
      message: error.response?.data?.message || 'Failed to connect to AstrologyAPI'
    });
  }
});

module.exports = router;