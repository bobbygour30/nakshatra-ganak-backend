const mongoose = require('mongoose');

const scheduledPdfSchema = new mongoose.Schema({
  userDetails: {
    fullName: { type: String, required: true },
    email: { type: String, default: '' },
    mobile: { type: String, required: true },
    city: { type: String, default: '' }
  },
  pdf: {
    url: { type: String, required: true },
    cloudinaryUrl: { type: String, required: true },
    filename: { type: String, required: true }
  },
  sentAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['sent', 'failed'],
    default: 'sent'
  },
  whatsappSent: { type: Boolean, default: false },
  whatsappError: { type: String, default: '' },
  attempts: { type: Number, default: 1 }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('ScheduledPdf', scheduledPdfSchema);