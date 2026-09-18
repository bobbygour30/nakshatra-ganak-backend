const mongoose = require('mongoose');

const scheduledPremiumPdfSchema = new mongoose.Schema(
  {
    userDetails: {
      fullName: {
        type: String,
        required: true,
        trim: true
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        default: ''
      },
      mobile: {
        type: String,
        required: true,
        trim: true
      },
      city: {
        type: String,
        trim: true,
        default: ''
      }
    },

    pdf: {
      url: {
        type: String,
        required: true
      },
      cloudinaryUrl: {
        type: String,
        default: ''
      },
      filename: {
        type: String,
        required: true
      }
    },

    paymentId: {
      type: String,
      required: true,
      unique: true, // prevents duplicate processing of the same payment
      index: true
    },

    orderId: {
      type: String,
      required: true
    },

    reportType: {
      type: String,
      default: 'premium',
      enum: ['premium']
    },

    status: {
      type: String,
      enum: ['scheduled', 'processing', 'sent', 'failed', 'cancelled'],
      default: 'scheduled',
      index: true
    },

    scheduledTime: {
      type: Date,
      required: true,
      index: true
    },

    sentAt: {
      type: Date,
      default: null
    },

    whatsappSent: {
      type: Boolean,
      default: false
    },

    attempts: {
      type: Number,
      default: 0
    },

    // Added: without this, attempts >= maxAttempts comparisons in the
    // WhatsApp processing logic compare against `undefined`, which is
    // fragile. This mirrors the ScheduledPdf (basic) schema.
    maxAttempts: {
      type: Number,
      default: 3
    },

    lastAttemptAt: {
      type: Date,
      default: null
    },

    error: {
      type: String,
      default: null
    },

    whatsappError: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound index to quickly find due scheduled premium messages
scheduledPremiumPdfSchema.index({ status: 1, scheduledTime: 1 });

module.exports = mongoose.model(
  'ScheduledPremiumPdf',
  scheduledPremiumPdfSchema
);