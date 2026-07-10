const express = require('express');
const router = express.Router();
const axios = require('axios');
const { protect } = require('../middleware/auth');
const User = require('../models/User');

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
    // FIXED: Handle {start, end} objects
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
//  FIXED: Normalize Panchang Helper - ensures consistent data shape
// ============================================================
const normalizePanchangData = (data) => {
  // Helper to safely format time-range objects
  const formatTimeRange = (obj) => {
    if (!obj) return 'N/A';
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'object' && obj.start !== undefined && obj.end !== undefined) {
      return `${obj.start} - ${obj.end}`;
    }
    return 'N/A';
  };

  // Helper to safely extract string from nested objects
  const extractString = (obj, path) => {
    if (!obj) return 'N/A';
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return 'N/A';
      }
    }
    if (current === null || current === undefined) return 'N/A';
    if (typeof current === 'string') return current;
    if (typeof current === 'object') {
      if (current.name) return String(current.name);
      if (current.value) return String(current.value);
      if (current.text) return String(current.text);
      if (current.display) return String(current.display);
      // Check details object
      if (current.details) {
        if (current.details.tithi_name) return String(current.details.tithi_name);
        if (current.details.nak_name) return String(current.details.nak_name);
        if (current.details.yog_name) return String(current.details.yog_name);
        if (current.details.karan_name) return String(current.details.karan_name);
        if (current.details.ruler) return String(current.details.ruler);
        if (current.details.lord) return String(current.details.lord);
        if (current.details.deity) return String(current.details.deity);
        // Try to find any string property
        for (const p in current.details) {
          if (typeof current.details[p] === 'string' && current.details[p]) {
            return String(current.details[p]);
          }
        }
      }
      // Handle time-range objects
      if (current.start !== undefined && current.end !== undefined) {
        return `${current.start} - ${current.end}`;
      }
      return 'N/A';
    }
    return String(current);
  };

  // Extract tithi name from various possible formats
  let tithiName = 'N/A';
  if (data.tithi) {
    if (typeof data.tithi === 'string') {
      tithiName = data.tithi;
    } else if (data.tithi.details && data.tithi.details.tithi_name) {
      tithiName = data.tithi.details.tithi_name;
    } else if (data.tithi.name) {
      tithiName = data.tithi.name;
    }
  }

  // Extract nakshatra name
  let nakshatraName = 'N/A';
  if (data.nakshatra) {
    if (typeof data.nakshatra === 'string') {
      nakshatraName = data.nakshatra;
    } else if (data.nakshatra.details && data.nakshatra.details.nak_name) {
      nakshatraName = data.nakshatra.details.nak_name;
    } else if (data.nakshatra.name) {
      nakshatraName = data.nakshatra.name;
    }
  }

  // Extract yoga name
  let yogaName = 'N/A';
  if (data.yog) {
    if (typeof data.yog === 'string') {
      yogaName = data.yog;
    } else if (data.yog.details && data.yog.details.yog_name) {
      yogaName = data.yog.details.yog_name;
    } else if (data.yog.name) {
      yogaName = data.yog.name;
    }
  }

  // Extract karana name
  let karanaName = 'N/A';
  if (data.karan) {
    if (typeof data.karan === 'string') {
      karanaName = data.karan;
    } else if (data.karan.details && data.karan.details.karan_name) {
      karanaName = data.karan.details.karan_name;
    } else if (data.karan.name) {
      karanaName = data.karan.name;
    }
  }

  return {
    // Day info
    day: data.day || 'N/A',
    weekday: data.weekday || 'N/A',
    
    // Timings - ensure they're strings
    sunrise: data.sunrise || 'N/A',
    sunset: data.sunset || 'N/A',
    moonrise: data.moonrise || 'N/A',
    moonset: data.moonset || 'N/A',
    vedicSunrise: data.vedic_sunrise || 'N/A',
    vedicSunset: data.vedic_sunset || 'N/A',
    
    // Panchang elements - always strings
    tithi: tithiName,
    tithiNumber: extractString(data, 'tithi.details.tithi_number'),
    tithiSpecial: extractString(data, 'tithi.details.special'),
    tithiSummary: extractString(data, 'tithi.details.summary'),
    tithiDeity: extractString(data, 'tithi.details.deity'),
    tithiEnd: data.tithi?.end_time ? 
      `${String(data.tithi.end_time.hour).padStart(2, '0')}:${String(data.tithi.end_time.minute).padStart(2, '0')}:${String(data.tithi.end_time.second || 0).padStart(2, '0')}` : 'N/A',
    
    nakshatra: nakshatraName,
    nakshatraNumber: extractString(data, 'nakshatra.details.nak_number'),
    nakshatraRuler: extractString(data, 'nakshatra.details.ruler') !== 'N/A' ? 
      extractString(data, 'nakshatra.details.ruler') : 
      extractString(data, 'nakshatra.details.lord'),
    nakshatraDeity: extractString(data, 'nakshatra.details.deity'),
    nakshatraSpecial: extractString(data, 'nakshatra.details.special'),
    nakshatraSummary: extractString(data, 'nakshatra.details.summary'),
    nakshatraEnd: data.nakshatra?.end_time ? 
      `${String(data.nakshatra.end_time.hour).padStart(2, '0')}:${String(data.nakshatra.end_time.minute).padStart(2, '0')}:${String(data.nakshatra.end_time.second || 0).padStart(2, '0')}` : 'N/A',
    
    yog: yogaName,
    yogDeity: extractString(data, 'yog.details.deity'),
    
    karan: karanaName,
    karanDeity: extractString(data, 'karan.details.deity'),
    
    // Additional details
    paksha: data.paksha || 'N/A',
    ritu: data.ritu || 'N/A',
    ayana: data.ayana || 'N/A',
    hinduMaah: data.hindu_maah || 'N/A',
    sunSign: data.sun_sign || 'N/A',
    moonSign: data.moon_sign || 'N/A',
    vikramSamvat: data.vikram_samvat || 'N/A',
    shakaSamvat: data.shaka_samvat || 'N/A',
    
    // FIXED: Format time-range objects as strings
    abhijitMuhurta: formatTimeRange(data.abhijit_muhurta),
    rahuKaal: formatTimeRange(data.rahukaal),
    yamaganda: formatTimeRange(data.yamghant_kaal || data.yamaganda),
    gulika: formatTimeRange(data.guliKaal || data.gulika),
    
    // Disha Shool
    dishaShool: data.disha_shool || 'N/A',
    dishaShoolRemedies: data.disha_shool_remedies || 'N/A',
    nakShool: data.nak_shool || 'N/A',
    moonNivas: data.moon_nivas || 'N/A',
    
    // Keep raw for debugging
    _raw: data
  };
};

// ============================================================
//  GENERATE PANCHANG (AstrologyAPI.com)
// ============================================================
router.post('/generate', protect, async (req, res) => {
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

    // ============================================================
    //  MAPPING – Only what the API provides
    // ============================================================
    
    const panchangData = {
      // Day info
      day: data.day || 'N/A',
      weekday: data.weekday || 'N/A',
      
      // Timings
      sunrise: data.sunrise || 'N/A',
      sunset: data.sunset || 'N/A',
      moonrise: data.moonrise || 'N/A',
      moonset: data.moonset || 'N/A',
      vedicSunrise: data.vedic_sunrise || 'N/A',
      vedicSunset: data.vedic_sunset || 'N/A',
      
      // Panchang elements
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
      
      // Additional details
      paksha: data.paksha || 'N/A',
      ritu: data.ritu || 'N/A',
      ayana: data.ayana || 'N/A',
      hinduMaah: data.hindu_maah || 'N/A',
      sunSign: data.sun_sign || 'N/A',
      moonSign: data.moon_sign || 'N/A',
      vikramSamvat: data.vikram_samvat || 'N/A',
      shakaSamvat: data.shaka_samvat || 'N/A',
      
      // Auspicious periods - FIXED: Format as strings
      abhijitMuhurta: data.abhijit_muhurta ? 
        (typeof data.abhijit_muhurta === 'string' ? data.abhijit_muhurta : 
         `${data.abhijit_muhurta.start} - ${data.abhijit_muhurta.end}`) : 'N/A',
      
      // Special timings - FIXED: Format as strings
      rahuKaal: data.rahukaal?.start && data.rahukaal?.end ? 
        `${data.rahukaal.start} - ${data.rahukaal.end}` : 'N/A',
      yamaganda: data.yamghant_kaal?.start && data.yamghant_kaal?.end ? 
        `${data.yamghant_kaal.start} - ${data.yamghant_kaal.end}` : 'N/A',
      gulika: data.guliKaal?.start && data.guliKaal?.end ? 
        `${data.guliKaal.start} - ${data.guliKaal.end}` : 'N/A',
      
      // Disha Shool
      dishaShool: data.disha_shool || 'N/A',
      dishaShoolRemedies: data.disha_shool_remedies || 'N/A',
      nakShool: data.nak_shool || 'N/A',
      moonNivas: data.moon_nivas || 'N/A',
      
      _raw: data
    };

    // Simplified Kundli data - only what's available
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

// ============================================================
//  FIXED: SAVE ROUTE - Normalizes data before saving
// ============================================================
router.post('/save-purchased-kundli', protect, async (req, res) => {
  try {
    const { kundliData, panchangData, birthDetails } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // FIXED: Normalize the panchang data before saving
    const normalizedPanchang = normalizePanchangData(panchangData);
    
    // Also normalize kundli data
    const normalizedKundli = {
      moonSign: kundliData?.moonSign || 'N/A',
      nakshatra: typeof kundliData?.nakshatra === 'object' ? 
        (kundliData.nakshatra.details?.nak_name || kundliData.nakshatra.name || 'N/A') : 
        (kundliData?.nakshatra || 'N/A'),
      tithi: typeof kundliData?.tithi === 'object' ?
        (kundliData.tithi.details?.tithi_name || kundliData.tithi.name || 'N/A') :
        (kundliData?.tithi || 'N/A'),
      yoga: typeof kundliData?.yoga === 'object' ?
        (kundliData.yoga.details?.yog_name || kundliData.yoga.name || 'N/A') :
        (kundliData?.yoga || 'N/A'),
      karana: typeof kundliData?.karana === 'object' ?
        (kundliData.karana.details?.karan_name || kundliData.karana.name || 'N/A') :
        (kundliData?.karana || 'N/A'),
      paksha: kundliData?.paksha || 'N/A',
      ritu: kundliData?.ritu || 'N/A',
      ayana: kundliData?.ayana || 'N/A',
      sunSign: kundliData?.sunSign || 'N/A'
    };

    if (!user.savedCharts) user.savedCharts = [];
    user.savedCharts.push({
      birthDetails,
      kundliData: normalizedKundli,
      panchangData: normalizedPanchang,
      purchasedAt: new Date(),
      isPaid: true
    });
    await user.save();
    res.json({ success: true, message: 'Kundli saved to profile successfully' });
  } catch (err) {
    console.error('Save kundli error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  GET & OTHER ROUTES
// ============================================================
router.get('/my-purchased-kundlis', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const allCharts = user.savedCharts || [];
    let migrated = false;
    allCharts.forEach(chart => {
      if (chart.isPaid === undefined) {
        chart.isPaid = true;
        migrated = true;
      }
    });
    if (migrated) await user.save();

    res.json({ success: true, kundlis: allCharts, totalCharts: allCharts.length });
  } catch (err) {
    console.error('Error fetching kundlis:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/save', protect, async (req, res) => {
  try {
    const { birthDetails, kundliData, panchangData } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.savedCharts = user.savedCharts || [];
    user.savedCharts.push({ birthDetails, kundliData, panchangData, createdAt: new Date() });
    await user.save();
    res.json({ success: true, message: 'Chart saved successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/saved', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, charts: user.savedCharts || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/saved/:chartId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.savedCharts = user.savedCharts.filter(c => c._id.toString() !== req.params.chartId);
    await user.save();
    res.json({ success: true, message: 'Chart deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;