const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const fs = require('fs');
const axios = require('axios');
const { protect } = require('../middleware/auth');
const User = require('../models/User');

// ✅ Correct API Base URL
const API_BASE = 'https://json.astrologyapi.com/v1';
const ACCESS_TOKEN = process.env.ASTRO_ACCESS_TOKEN;

console.log('=================================');
console.log('🔥 AstrologyAPI Configuration');
console.log('Access Token:', ACCESS_TOKEN ? '✅ Set' : '❌ Missing');
console.log('Base URL :', API_BASE);
console.log('=================================');

const getHeaders = () => {
  if (!ACCESS_TOKEN) return null;
  return {
    'x-astrologyapi-key': ACCESS_TOKEN,
    'Content-Type': 'application/json'
  };
};

// Helper function to get zodiac from degree
const getZodiacFromDegree = (degree) => {
  if (!degree && degree !== 0) return 'N/A';
  const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  return signs[Math.floor(degree / 30) % 12];
};

// Helper function to get lord from sign
const getLordFromSign = (sign) => {
  const lordMap = {
    'Aries': 'Mars', 'Taurus': 'Venus', 'Gemini': 'Mercury',
    'Cancer': 'Moon', 'Leo': 'Sun', 'Virgo': 'Mercury',
    'Libra': 'Venus', 'Scorpio': 'Mars', 'Sagittarius': 'Jupiter',
    'Capricorn': 'Saturn', 'Aquarius': 'Saturn', 'Pisces': 'Jupiter'
  };
  return lordMap[sign] || 'N/A';
};

// Calculate houses from ascendant
const getHousesFromAscendant = (ascendant) => {
  const zodiacSigns = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  let startIndex = zodiacSigns.findIndex(s => s.toLowerCase() === ascendant.toLowerCase());
  if (startIndex === -1) startIndex = 0;
  
  const houses = [];
  for (let i = 0; i < 12; i++) {
    const signIndex = (startIndex + i) % 12;
    houses.push({
      number: i + 1,
      sign: zodiacSigns[signIndex],
      degree: `${i * 30}° - ${(i + 1) * 30}°`,
      lord: getLordFromSign(zodiacSigns[signIndex])
    });
  }
  return houses;
};

// Calculate planets positions based on date (approximate for demo)
const getPlanetsFromDate = (year, month, date) => {
  const planets = {};
  const planetList = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];
  const planetNames = { sun: 'Sun', moon: 'Moon', mars: 'Mars', mercury: 'Mercury', jupiter: 'Jupiter', venus: 'Venus', saturn: 'Saturn', rahu: 'Rahu', ketu: 'Ketu' };
  const zodiacSigns = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  
  // Calculate approximate day of year
  const dayOfYear = Math.floor((new Date(year, month - 1, date) - new Date(year, 0, 0)) / 86400000);
  
  // Approximate planet longitudes
  const longitudes = {
    sun: (dayOfYear * 0.9856) % 360,
    moon: (dayOfYear * 13.176) % 360,
    mars: ((dayOfYear * 0.524) % 360) + 120,
    mercury: ((dayOfYear * 1.234) % 360) + 80,
    jupiter: ((dayOfYear * 0.083) % 360) + 240,
    venus: ((dayOfYear * 1.602) % 360) + 45,
    saturn: ((dayOfYear * 0.033) % 360) + 180,
    rahu: ((dayOfYear * 0.052) % 360) + 300,
    ketu: ((dayOfYear * 0.052) % 360) + 120
  };
  
  for (const planet of planetList) {
    const longitude = longitudes[planet];
    const signIndex = Math.floor(longitude / 30) % 12;
    planets[planet] = {
      name: planetNames[planet],
      sign: zodiacSigns[signIndex],
      degree: Math.floor(longitude),
      house: signIndex + 1,
      retrograde: planet === 'saturn' || planet === 'rahu' || planet === 'ketu'
    };
  }
  
  return planets;
};

// Calculate Dasha based on Moon's nakshatra
const getDashaFromNakshatra = (nakshatra) => {
  const nakshatraDashaMap = {
    'Ashwini': 'Ketu', 'Bharani': 'Venus', 'Krittika': 'Sun',
    'Rohini': 'Moon', 'Mrigashira': 'Mars', 'Ardra': 'Rahu',
    'Punarvasu': 'Jupiter', 'Pushya': 'Saturn', 'Ashlesha': 'Mercury',
    'Magha': 'Ketu', 'Purva Phalguni': 'Venus', 'Uttara Phalguni': 'Sun',
    'Hasta': 'Moon', 'Chitra': 'Mars', 'Swati': 'Rahu',
    'Vishakha': 'Jupiter', 'Anuradha': 'Saturn', 'Jyeshtha': 'Mercury',
    'Mula': 'Ketu', 'Purva Ashadha': 'Venus', 'Uttara Ashadha': 'Sun',
    'Shravana': 'Moon', 'Dhanishtha': 'Mars', 'Shatabhisha': 'Rahu',
    'Purva Bhadrapada': 'Jupiter', 'Uttara Bhadrapada': 'Saturn', 'Revati': 'Mercury'
  };
  
  const dashaOrder = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
  const dashaYears = [7, 20, 6, 10, 7, 18, 16, 19, 17];
  
  const mahaDasha = nakshatraDashaMap[nakshatra] || 'Venus';
  const currentIndex = dashaOrder.indexOf(mahaDasha);
  const antarDasha = dashaOrder[(currentIndex + 1) % 9] || 'Sun';
  
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + dashaYears[currentIndex]);
  
  return {
    maha_dasha: mahaDasha,
    antar_dasha: antarDasha,
    end_date: endDate.toISOString().split('T')[0]
  };
};

// ================== GENERATE KUNDLI & PANCHANG ==================
router.post('/generate', protect, async (req, res) => {
  try {
    const { date, month, year, hour, minute, latitude, longitude, timezone = 5.5 } = req.body;

    console.log('📥 Received:', { date, month, year, hour, minute, latitude, longitude });

    // Validation
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
      tzone: parseFloat(timezone),
      ayanamsha: 'lahiri'
    };

    console.log('📤 Request to AstrologyAPI:', JSON.stringify(requestBody, null, 2));

    const headers = getHeaders();

    if (!headers) {
      return res.status(401).json({
        success: false,
        message: 'Astrology API Access Token missing in .env file'
      });
    }

    // ✅ Call both APIs
    const [kundliResponse, panchangResponse] = await Promise.all([
      axios.post(`${API_BASE}/astro_details`, requestBody, {
        headers: headers,
        timeout: 30000
      }),
      axios.post(`${API_BASE}/basic_panchang`, requestBody, {
        headers: headers,
        timeout: 30000
      })
    ]);

    console.log('✅ Both APIs responded successfully');
    
    const kundliRaw = kundliResponse.data;
    const panchangRaw = panchangResponse.data;
    
    console.log('📊 Kundli Response:', JSON.stringify(kundliRaw, null, 2));

    // ✅ Extract data from response
    const ascendant = kundliRaw.ascendant || 'N/A';
    const ascendantLord = kundliRaw.ascendant_lord || getLordFromSign(ascendant);
    const sign = kundliRaw.sign || 'N/A';
    const nakshatra = kundliRaw.Naksahtra || kundliRaw.nakshatra || 'N/A';
    const nakshatraLord = kundliRaw.NaksahtraLord || 'N/A';
    const nakshatraPada = kundliRaw.Charan || 'N/A';
    
    // ✅ Generate houses from ascendant
    const houses = getHousesFromAscendant(ascendant);
    
    // ✅ Generate planets from date
    const planets = getPlanetsFromDate(year, month, date);
    
    // ✅ Calculate Dasha from nakshatra
    const dasha = getDashaFromNakshatra(nakshatra);
    
    // ✅ Vedic details from response
    const yoga = kundliRaw.Yog || 'N/A';
    const tithi = kundliRaw.Tithi || 'N/A';
    const karana = kundliRaw.Karan || 'N/A';
    const gan = kundliRaw.Gan || 'N/A';
    const nadi = kundliRaw.Nadi || 'N/A';
    const varna = kundliRaw.Varna || 'N/A';
    const vashya = kundliRaw.Vashya || 'N/A';
    const yoni = kundliRaw.Yoni || 'N/A';
    const signLord = kundliRaw.SignLord || getLordFromSign(sign);
    const tatva = kundliRaw.tatva || 'N/A';
    const paya = kundliRaw.paya || 'N/A';
    const nameAlphabet = kundliRaw.name_alphabet || 'N/A';
    const manglik = 'No'; // Calculate based on Mars position if needed
    
    // ✅ Panchang data
    const sunrise = panchangRaw.sunrise || 'N/A';
    const sunset = panchangRaw.sunset || 'N/A';
    const moonrise = panchangRaw.moonrise || 'N/A';
    const panchangTithi = panchangRaw.tithi || 'N/A';
    const panchangNakshatra = panchangRaw.nakshatra || 'N/A';
    const panchangYoga = panchangRaw.yog || 'N/A';
    const panchangKarana = panchangRaw.karan || 'N/A';
    
    // ✅ Merge final response
    const mergedKundli = {
      ascendant_sign: ascendant,
      ascendant_lord: ascendantLord,
      sign: sign,
      rashi: sign,
      sign_lord: signLord,
      nakshatra: nakshatra,
      nakshatra_lord: nakshatraLord,
      nakshatra_pada: nakshatraPada,
      manglik: manglik,
      yoga: yoga,
      tithi: tithi,
      karana: karana,
      gan: gan,
      nadi: nadi,
      varna: varna,
      vashya: vashya,
      yoni: yoni,
      tatva: tatva,
      paya: paya,
      name_alphabet: nameAlphabet,
      planets: planets,
      houses: houses,
      dasha: dasha
    };
    
    const mergedPanchang = {
      sunrise: sunrise,
      sunset: sunset,
      moonrise: moonrise,
      tithi: panchangTithi,
      nakshatra: panchangNakshatra,
      yog: panchangYoga,
      karan: panchangKarana,
      paksha: panchangTithi?.split('-')[0] || 'N/A',
      ritu: 'N/A',
      ayana: 'N/A'
    };

    console.log('✅ Final Kundli - Houses:', mergedKundli.houses.length);
    console.log('✅ Final Kundli - Dasha:', mergedKundli.dasha);
    console.log('✅ Final Kundli - Planets:', Object.keys(mergedKundli.planets).length);

    return res.json({
      success: true,
      kundli: mergedKundli,
      panchang: mergedPanchang
    });

  } catch (apiError) {
    console.error("=== ASTROLOGY API ERROR ===");
    console.error("Status:", apiError.response?.status);
    console.error("Response:", JSON.stringify(apiError.response?.data, null, 2));
    console.error("Message:", apiError.message);
    
    if (apiError.response?.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Access Token. Please check your Access Token.'
      });
    }

    return res.status(502).json({
      success: false,
      message: apiError.response?.data?.message || 'Failed to connect to Astrology API',
      details: apiError.response?.data
    });
  }
});

// ✅ Ek baar chalao, phir hata dena - Sirf old charts ko fix karne ke liye
// ================== DOWNLOAD PDF WITH PDFKIT ==================

// Helper function
const getValue = (obj, keys, defaultValue = 'N/A') => {
  if (!obj) return defaultValue;
  const keyArray = Array.isArray(keys) ? keys : [keys];
  for (const key of keyArray) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return defaultValue;
};

// ================== DOWNLOAD PDF ==================
router.post('/download-pdf', async (req, res) => {
  try {
    const { kundliData, panchangData, userDetails } = req.body;
    
    console.log(' Generating PDF for:', userDetails?.name || 'User');
    console.log(  
  "Panchang Data:",
  JSON.stringify(panchangData, null, 2)
);

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: 'Kundli Report',
        Author: 'Nakshatra Ganak',
        Subject: 'Astrological Report'
      }
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=kundli_report_${Date.now()}.pdf`);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Pipe PDF to response
    doc.pipe(res);

    // ========== COLORS ==========
    const primaryColor = '#000000';
    const secondaryColor = '#000000';
    const accentColor = '#000000';
    const successColor = '#000000';
    const textColor = '#000000';
    const lightText = '#000000';
    const borderColor = '#000000';
    const whiteColor = '#000000';

    // ========== HEADER SECTION ==========
    // Main Title
    doc.fontSize(22)
       .fillColor(primaryColor)
       .font('Helvetica-Bold')
       .text('NAKSHATRA GANAK', { align: 'center' });
    
    // Subtitle
    doc.fontSize(12)
       .fillColor(lightText)
       .font('Helvetica')
       .text('Complete Kundli Report', { align: 'center' });
    
    // Generated Date
    doc.fontSize(9)
       .text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
    
    doc.moveDown(1.5);
    
    // Divider Line
    doc.strokeColor(borderColor)
       .lineWidth(0.5)
       .moveTo(50, doc.y)
       .lineTo(545, doc.y)
       .stroke();
    
    doc.moveDown(1);

    // ========== USER INFORMATION SECTION ==========
const infoY = doc.y;

// Outer Border
doc.rect(50, infoY, 495, 90)
   .lineWidth(1)
   .strokeColor('#000000')
   .stroke();

// Heading
doc.fontSize(13)
   .font('Helvetica-Bold')
   .fillColor('#000000')
   .text('PERSONAL INFORMATION', 60, infoY + 10);

// Divider Line
doc.moveTo(60, infoY + 30)
   .lineTo(535, infoY + 30)
   .stroke();

// Left Column
doc.fontSize(10)
   .font('Helvetica');

doc.text(
  `Name: ${userDetails?.name || 'User'}`,
  60,
  infoY + 42
);

doc.text(
  `Email: ${userDetails?.email || 'Not Provided'}`,
  60,
  infoY + 62
);

// Right Column
if (userDetails?.birthDetails) {
  const bd = userDetails.birthDetails;

  doc.text(
    `DOB: ${bd.date}/${bd.month}/${bd.year}`,
    300,
    infoY + 42
  );

  doc.text(
    `Birth Time: ${bd.hour}:${String(
      bd.minute || 0
    ).padStart(2, '0')}`,
    300,
    infoY + 62
  );

  doc.text(
    `Location: ${bd.latitude}, ${bd.longitude}`,
    60,
    infoY + 82
  );
}

// Move cursor below box
doc.y = infoY + 110;
    
    doc.moveDown(3);

    // ========== LAGNA (ASCENDANT) SECTION ==========
    const ascendant = getValue(kundliData, ['ascendant_sign', 'lagna', 'ascendant', 'sign'], 'N/A');
    const ascendantLord = getValue(kundliData, ['ascendant_lord', 'lagna_lord'], 'N/A');
    
    doc.rect(50, doc.y, 495, 70)
       .stroke();
    
    doc.fillColor(textColor)
       .fontSize(14)
       .font('Helvetica-Bold')
       .text('LAGNA (ASCENDANT)', 60, doc.y + 20, { align: 'center', width: 475 });
    
    doc.fontSize(28)
       .font('Helvetica-Bold')
       .text(ascendant, { align: 'center', width: 475 });
    
    doc.fontSize(11)
       .font('Helvetica')
       .text(`Lord: ${ascendantLord}`, { align: 'center', width: 475 });
    
    doc.moveDown(2.5);

    // ========== MANGLIK DOSHA SECTION ==========
    const manglik = getValue(kundliData, ['manglik', 'Manglik', 'is_manglik'], 'Non-Manglik');
    const isManglik = (manglik === 'Yes' || manglik === 'Manglik');
    
    doc.rect(50, doc.y, 495, 35)
       .stroke();
    
    doc.fillColor(textColor)
       .fontSize(12)
       .font('Helvetica-Bold')
       .text(`MANGLIK DOSHA: ${isManglik ? 'Manglik' : 'Non-Manglik'}`, { align: 'center', width: 495 });
    
    doc.moveDown(2);

    // ========== SECTION HELPER FUNCTION ==========
    const addSection = (title) => {
      doc.fillColor('#000000')
         .fontSize(13)
         .font('Helvetica-Bold')
         .text(title);
      doc.strokeColor(borderColor)
         .lineWidth(0.5)
         .moveTo(50, doc.y)
         .lineTo(545, doc.y)
         .stroke();
      doc.moveDown(0.5);
    };

    // ========== RASHI & NAKSHATRA SECTION ==========
    addSection('RASHI AND NAKSHATRA DETAILS');
    
    const rashi = getValue(kundliData, ['sign', 'rashi', 'moon_sign'], 'N/A');
    const nakshatra = getValue(kundliData, ['nakshatra', 'Naksahtra'], 'N/A');
    const nakshatraLord = getValue(kundliData, ['nakshatra_lord', 'lord'], 'N/A');
    const nakshatraPada = getValue(kundliData, ['pada', 'Charan', 'charan'], 'N/A');
    
    doc.fillColor(textColor)
       .fontSize(10)
       .font('Helvetica');
    
    let rowY = doc.y;
    doc.text(`Moon Sign (Rashi): ${rashi}`, 50, rowY);
    doc.text(`Nakshatra: ${nakshatra}`, 300, rowY);
    
    rowY = doc.y + 20;
    doc.text(`Nakshatra Lord: ${nakshatraLord}`, 50, rowY);
    doc.text(`Pada / Charan: ${nakshatraPada}`, 300, rowY);
    
    doc.y = rowY + 25;

    // ========== VEDIC DETAILS SECTION ==========
    addSection('VEDIC ASTROLOGICAL DETAILS');
    
    const vedicItems = [
      { label: 'Yoga', value: getValue(kundliData, ['yoga', 'yog'], 'N/A') },
      { label: 'Tithi', value: getValue(kundliData, ['tithi'], 'N/A') },
      { label: 'Karana', value: getValue(kundliData, ['karana'], 'N/A') },
      { label: 'Gan', value: getValue(kundliData, ['gan'], 'N/A') },
      { label: 'Nadi', value: getValue(kundliData, ['nadi'], 'N/A') },
      { label: 'Varna', value: getValue(kundliData, ['varna'], 'N/A') },
      { label: 'Vashya', value: getValue(kundliData, ['vashya'], 'N/A') },
      { label: 'Yoni', value: getValue(kundliData, ['yoni'], 'N/A') },
      { label: 'Sign Lord', value: getValue(kundliData, ['sign_lord'], 'N/A') },
      { label: 'Tatva', value: getValue(kundliData, ['tatva'], 'N/A') },
      { label: 'Paya', value: getValue(kundliData, ['paya'], 'N/A') },
      { label: 'Name Alphabet', value: getValue(kundliData, ['name_alphabet'], 'N/A') }
    ];
    
    let vedicY = doc.y;
    for (let i = 0; i < vedicItems.length; i += 2) {
      if (vedicY > 720) {
        doc.addPage();
        vedicY = 70;
        addSection('VEDIC ASTROLOGICAL DETAILS (Continued)');
      }
      doc.text(`${vedicItems[i].label}: ${vedicItems[i].value}`, 50, vedicY);
      if (vedicItems[i + 1]) {
        doc.text(`${vedicItems[i + 1].label}: ${vedicItems[i + 1].value}`, 300, vedicY);
      }
      vedicY = doc.y + 18;
    }
    doc.y = vedicY + 5;

    // ========== PLANETARY POSITIONS SECTION ==========
    addSection('PLANETARY POSITIONS');
    
    const planets = kundliData.planets || {};
    const planetNames = { 
      sun: 'Sun', moon: 'Moon', mars: 'Mars', mercury: 'Mercury',
      jupiter: 'Jupiter', venus: 'Venus', saturn: 'Saturn', 
      rahu: 'Rahu', ketu: 'Ketu' 
    };
    
    // Table Header
    let tableY = doc.y;
    doc.fillColor('#000000')
       .fontSize(9)
       .font('Helvetica-Bold')
       .text('Planet', 50, tableY)
       .text('Sign', 160, tableY)
       .text('Degree', 250, tableY)
       .text('House', 330, tableY)
       .text('Retrograde', 420, tableY);
    
    // Header underline
    doc.strokeColor(borderColor)
       .lineWidth(0.5)
       .moveTo(50, tableY + 15)
       .lineTo(545, tableY + 15)
       .stroke();
    
    let planetRowY = tableY + 25;
    doc.fillColor(textColor)
       .fontSize(9)
       .font('Helvetica');
    
    for (const [planet, info] of Object.entries(planets)) {
      if (planetRowY > 750) {
        doc.addPage();
        planetRowY = 70;
        // Redraw header
        doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold');
        doc.text('Planet', 50, planetRowY).text('Sign', 160, planetRowY).text('Degree', 250, planetRowY).text('House', 330, planetRowY).text('Retrograde', 420, planetRowY);
        doc.strokeColor(borderColor).lineWidth(0.5).moveTo(50, planetRowY + 15).lineTo(545, planetRowY + 15).stroke();
        planetRowY += 25;
        doc.fillColor(textColor).fontSize(9).font('Helvetica');
      }
      doc.text(planetNames[planet] || planet, 50, planetRowY)
         .text(info.sign || 'N/A', 160, planetRowY)
         .text(`${info.degree || 'N/A'}`, 250, planetRowY)
         .text(info.house || 'N/A', 330, planetRowY)
         .text(info.retrograde ? 'Yes' : 'No', 420, planetRowY);
      planetRowY += 18;
    }
    
    doc.y = planetRowY + 10;

    // ========== HOUSES SECTION ==========
    addSection('HOUSES (BHAVAS)');
    
    const houses = kundliData.houses || [];
    const houseNames = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
    
    // Table Header
    let houseTableY = doc.y;
    doc.fillColor(primaryColor)
       .fontSize(9)
       .font('Helvetica-Bold')
       .text('House', 50, houseTableY)
       .text('Sign', 160, houseTableY)
       .text('Lord', 270, houseTableY)
       .text('Degree', 380, houseTableY);
    
    // Header underline
    doc.strokeColor(borderColor)
       .lineWidth(0.5)
       .moveTo(50, houseTableY + 15)
       .lineTo(545, houseTableY + 15)
       .stroke();
    
    let houseRowY = houseTableY + 25;
    doc.fillColor(textColor)
       .fontSize(9)
       .font('Helvetica');
    
    for (let i = 0; i < Math.min(12, houses.length); i++) {
      const house = houses[i];
      if (houseRowY > 750) {
        doc.addPage();
        houseRowY = 70;
        // Redraw header
        doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold');
        doc.text('House', 50, houseRowY).text('Sign', 160, houseRowY).text('Lord', 270, houseRowY).text('Degree', 380, houseRowY);
        doc.strokeColor(borderColor).lineWidth(0.5).moveTo(50, houseRowY + 15).lineTo(545, houseRowY + 15).stroke();
        houseRowY += 25;
        doc.fillColor(textColor).fontSize(9).font('Helvetica');
      }
      doc.text(houseNames[i], 50, houseRowY)
         .text(house.sign || 'N/A', 160, houseRowY)
         .text(house.lord || 'N/A', 270, houseRowY)
         .text(house.degree ? `${house.degree}` : 'N/A', 380, houseRowY);
      houseRowY += 18;
    }
    
    doc.y = houseRowY + 15;

    // ========== DASHA SECTION ==========
    const mahaDasha = getValue(kundliData, ['dasha.maha_dasha', 'current_dasha.maha_dasha'], 'N/A');
    
    if (mahaDasha !== 'N/A') {
      addSection('CURRENT VIMSHOTTARI DASHA');
      
      const antarDasha = getValue(kundliData, ['dasha.antar_dasha', 'current_dasha.antar_dasha'], 'N/A');
      const dashaEnd = getValue(kundliData, ['dasha.end_date', 'current_dasha.end_date'], 'N/A');
      
      doc.fillColor(textColor)
         .fontSize(10)
         .font('Helvetica');
      
      doc.text(`Maha Dasha: ${mahaDasha}`, 50, doc.y);
      doc.text(`Antar Dasha: ${antarDasha}`, 50, doc.y + 18);
      if (dashaEnd !== 'N/A') {
        doc.text(`Valid Until: ${dashaEnd}`, 50, doc.y + 36);
      }
      
      doc.moveDown(2.5);
    }

    // ========== PANCHANG SECTION ==========
    addSection('DAILY PANCHANG');
    
    const panchangItems = [
      { label: 'Sunrise', value: getValue(panchangData, ['sunrise', 'Sunrise'], 'N/A') },
      { label: 'Sunset', value: getValue(panchangData, ['sunset', 'Sunset'], 'N/A') },
      { label: 'Moonrise', value: getValue(panchangData, ['moonrise', 'Moonrise'], 'N/A') },
      { label: 'Moonset', value: getValue(panchangData, ['moonset', 'Moonset'], 'N/A') },
      { label: 'Tithi', value: getValue(panchangData, ['tithi'], 'N/A') },
      { label: 'Nakshatra', value: getValue(panchangData, ['nakshatra'], 'N/A') },
      { label: 'Yoga', value: getValue(panchangData, ['yog', 'yoga'], 'N/A') },
      { label: 'Karana', value: getValue(panchangData, ['karan'], 'N/A') },
      { label: 'Rahu Kaal', value: getValue(panchangData, ['rahukaal'], 'N/A') },
      { label: 'Yamaganda', value: getValue(panchangData, ['yamaganda'], 'N/A') },
      { label: 'Gulika', value: getValue(panchangData, ['gulika'], 'N/A') },
      { label: 'Paksha', value: getValue(panchangData, ['paksha'], 'N/A') },
      { label: 'Ritu', value: getValue(panchangData, ['ritu'], 'N/A') },
      { label: 'Ayana', value: getValue(panchangData, ['ayana'], 'N/A') }
    ];
    let panchangY = doc.y;

for (let i = 0; i < panchangItems.length; i += 2) {
  if (panchangY > 750) {
    doc.addPage();
    panchangY = 70;
    addSection('DAILY PANCHANG (Continued)');
    panchangY = doc.y + 10; // heading ke niche start
  }

  doc.text(
    `${panchangItems[i].label}: ${panchangItems[i].value}`,
    50,
    panchangY
  );

  if (panchangItems[i + 1]) {
    doc.text(
      `${panchangItems[i + 1].label}: ${panchangItems[i + 1].value}`,
      300,
      panchangY
    );
  }

  // IMPORTANT
  panchangY += 20;
}

doc.y = panchangY;

    // ========== FOOTER ==========
    doc.moveDown(2);
    
    doc.strokeColor(borderColor)
       .lineWidth(0.5)
       .moveTo(50, doc.y)
       .lineTo(545, doc.y)
       .stroke();
    
    doc.moveDown(0.5);
    
    doc.fillColor('#000000')
       .fontSize(8)
       .font('Helvetica')
       .text('This is a computer-generated kundli report based on Vedic astrology calculations.', { align: 'center' })
       .text(`All rights reserved. Nakshatra Ganak - ${new Date().getFullYear()}`, { align: 'center' });
    
    // Finalize PDF
    doc.end();
    
    console.log(' PDF generated successfully');
    
  } catch (error) {
    console.error('PDF Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate PDF: ' + error.message 
      });
    }
  }
});


// ================== SAVE PURCHASED KUNDLI ==================
router.post('/save-purchased-kundli', protect, async (req, res) => {
  try {
    const { kundliData, panchangData, birthDetails } = req.body;
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.savedCharts) {
      user.savedCharts = [];
    }

    user.savedCharts.push({
      birthDetails: {
        date: birthDetails.date,
        month: birthDetails.month,
        year: birthDetails.year,
        hour: birthDetails.hour,
        minute: birthDetails.minute,
        latitude: birthDetails.latitude,
        longitude: birthDetails.longitude,
        timezone: birthDetails.timezone
      },
      kundliData: kundliData,
      panchangData: panchangData,
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

// ================== GET PURCHASED KUNDLIS ==================
// ================== GET PURCHASED KUNDLIS ==================
router.get('/my-purchased-kundlis', protect, async (req, res) => {
  try {
    console.log('🔍 Fetching purchased kundlis for user:', req.user._id);
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const allCharts = user.savedCharts || [];
    console.log(`📊 Total charts in DB: ${allCharts.length}`);
    
    // ✅ Include all charts (old ones without isPaid are also considered paid)
    const purchasedKundlis = allCharts.map(chart => {
      // If isPaid is missing, set it to true (migration)
      if (chart.isPaid === undefined) {
        chart.isPaid = true;
      }
      return chart;
    });
    
    // Save if any charts were migrated
    let migrated = false;
    for (const chart of purchasedKundlis) {
      if (chart.isPaid === undefined) {
        chart.isPaid = true;
        migrated = true;
      }
    }
    
    if (migrated) {
      await user.save();
      console.log('✅ Migrated old charts (added isPaid: true)');
    }
    
    console.log(`✅ Returning ${purchasedKundlis.length} kundlis`);
    
    res.json({ 
      success: true, 
      kundlis: purchasedKundlis,
      totalCharts: allCharts.length,
      count: purchasedKundlis.length
    });
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});
// ================== SAVE CHART ==================
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

// ================== GET SAVED CHARTS ==================
router.get('/saved', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, charts: user.savedCharts || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ================== DELETE SAVED CHART ==================
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