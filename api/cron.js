// api/cron.js - For Vercel Serverless Functions
const { processScheduledWhatsApp } = require('../routes/whatsapp');

export default async function handler(req, res) {
  // Verify cron secret for security
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  try {
    console.log('⏰ Vercel Cron triggered at:', new Date().toISOString());
    const result = await processScheduledWhatsApp();
    
    return res.status(200).json({
      success: true,
      message: 'Scheduled messages processed',
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cron error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process scheduled messages',
      error: error.message
    });
  }
}

// Make sure we export for both import styles
module.exports = handler;