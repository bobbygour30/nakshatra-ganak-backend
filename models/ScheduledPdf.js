const mongoose = require('mongoose');

const scheduledPdfSchema = new mongoose.Schema({
  userDetails: {
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    mobile: { type: String, required: true },
    city: { type: String, default: '' }
  },
  pdf: {
    url: { type: String, required: true },
    cloudinaryUrl: { type: String, required: true },
    filename: { type: String, required: true }
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'failed', 'scheduled'],
    default: 'scheduled'
  },
  whatsappSent: { type: Boolean, default: false },
  whatsappError: { type: String, default: null },
  scheduledTime: { type: Date, required: true },
  sentAt: { type: Date, default: null },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  lastAttemptAt: { type: Date, default: null }
}, { timestamps: true });

// Index for finding scheduled items ready to send
scheduledPdfSchema.index({ scheduledTime: 1, status: 1, whatsappSent: 1 });
scheduledPdfSchema.index({ status: 1, attempts: 1 });

module.exports = mongoose.model('ScheduledPdf', scheduledPdfSchema);