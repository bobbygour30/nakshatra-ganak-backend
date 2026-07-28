const mongoose = require('mongoose');

const scheduledPdfSchema = new mongoose.Schema({
  userDetails: {
    fullName: String,
    email: String,
    mobile: String,
    city: String
  },
  pdf: {
    url: String,
    cloudinaryUrl: String,
    filename: String
  },
  sentAt: Date,
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  attempts: { type: Number, default: 0 },
  error: String,
  // Track if WhatsApp was sent
  whatsappSent: { type: Boolean, default: false },
  whatsappError: String
}, { timestamps: true });

module.exports = mongoose.model('ScheduledPdf', scheduledPdfSchema);