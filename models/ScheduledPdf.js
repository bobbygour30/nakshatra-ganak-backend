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
  scheduledFor: { 
    type: Date, 
    required: true,
    index: true
  },
  sentAt: { type: Date },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending',
    index: true
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  error: { type: String, default: '' },
  whatsappSent: { type: Boolean, default: false },
  whatsappError: { type: String, default: '' },
  delayMinutes: { type: Number, default: 10 }
}, { 
  timestamps: true 
});

// Index for efficient cron job queries
scheduledPdfSchema.index({ status: 1, scheduledFor: 1, attempts: 1 });

module.exports = mongoose.model('ScheduledPdf', scheduledPdfSchema);