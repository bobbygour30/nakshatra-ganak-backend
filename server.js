const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const { initializeDefaultAdmin } = require("./controllers/adminController");
const dns = require("dns");
const cron = require("node-cron");

dotenv.config();

// DNS fix
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const app = express();

/* ================================
   CORS CONFIG
================================ */
const allowedOrigins = [
  "https://astarology-frontend.vercel.app",
  "https://nakshatraganak.com",
  "https://www.nakshatraganak.com",
  "www.nakshatraganak.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
    credentials: true,
  })
);

// Preflight
app.options("*", cors());

/* ================================
   BODY PARSER
================================ */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================================
   DB CONNECTION MIDDLEWARE
================================ */
let isAdminInitialized = false;

app.use(async (req, res, next) => {
  try {
    await connectDB();

    if (!isAdminInitialized) {
      await initializeDefaultAdmin();
      isAdminInitialized = true;
      console.log("✅ Admin initialized");
    }

    next();
  } catch (error) {
    console.error("❌ DB connection failed:", error.message);
    return res.status(500).json({
      msg: "Database connection failed",
      error: error.message,
    });
  }
});

/* ================================
   HEALTH CHECK
================================ */
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "API is running (Scheduled WhatsApp Send - 10 min delay)",
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    whatsapp: "SCHEDULED_SEND (10 min delay)",
    cronStatus: "Running (every minute)"
  });
});

/* ================================
   TEST CORS
================================ */
app.get("/api/test-cors", (req, res) => {
  res.json({
    message: "CORS is working!",
    origin: req.headers.origin || null,
  });
});

/* ================================
   ROUTES
================================ */
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/astrology', require('./routes/astrologyRoutes'));
app.use('/api/kundlipayments', require('./routes/kundliPaymantRoutes'));
app.use('/api/blogs', require('./routes/blogRoutes'));
app.use('/api/services', require('./routes/serviceRoutes'));
app.use('/api/service-payment', require('./routes/servicePaymentRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/astrology-match', require('./routes/astrologyMatch'));
app.use('/api/premium-kundli', require('./routes/premiumKundliRoutes'));
app.use('/api/premium-kundlipayments', require('./routes/premiumKundliPaymantRoutes'));

// WhatsApp routes - scheduled send (10 min delay)
const whatsappRoutes = require('./routes/whatsapp');
app.use('/api/whatsapp', whatsappRoutes.router);

/* ================================
   ROOT
================================ */
app.get("/", (req, res) => {
  res.json({
    message: "Nakshatra Ganak Auth API is running",
    version: "1.0.0",
    mode: "SCHEDULED_WHATSAPP_SEND (10 min delay)",
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    features: {
      pdfGeneration: "Active",
      whatsappSchedule: "10 minutes delay",
      cronJob: "Running every minute"
    }
  });
});

/* ================================
   404
================================ */
app.use((req, res) => {
  res.status(404).json({ msg: "Route not found" });
});

/* ================================
   ERROR HANDLER
================================ */
app.use((err, req, res, next) => {
  console.error("Error:", err);

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      msg: "CORS error: Origin not allowed",
    });
  }

  res.status(err.status || 500).json({
    msg: err.message || "Something went wrong!",
  });
});

/* ================================
   CRON JOB - Process scheduled WhatsApp messages
   (Basic Kundli AND Premium Kundli)
================================ */
let cronJobInitialized = false;

// Check database connection status
const checkDbConnection = () => {
  return mongoose.connection.readyState === 1;
};

// Function to process scheduled messages with retry
// NOTE: now runs both the basic and premium processors every tick.
// Previously only processScheduledMessages() (basic) was called here,
// which is why premium Kundli WhatsApp sends never fired even though
// records were being created in ScheduledPremiumPdf.
async function processWithRetry(maxRetries = 3) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // Check if database is connected
      if (!checkDbConnection()) {
        console.log(`⏳ Database not connected, attempt ${retries + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        retries++;
        continue;
      }

      // Import the process functions
      const { processScheduledMessages, processScheduledPremiumMessages } = require('./routes/whatsapp');

      // Process basic scheduled messages
      const result = await processScheduledMessages();

      if (result && result.success) {
        const { sent, failed, remaining } = result;
        if (sent > 0 || failed > 0) {
          console.log(`✅ Cron job (Basic): ${sent} sent, ${failed} failed, ${remaining || 0} remaining`);
        } else {
          console.log(`📭 Cron job (Basic): No scheduled messages to process`);
        }
      } else {
        console.error('❌ Cron job (Basic) failed:', result?.message || 'Unknown error');
      }

      // Process premium scheduled messages
      const premiumResult = await processScheduledPremiumMessages();

      if (premiumResult && premiumResult.success) {
        const { sent, failed, remaining } = premiumResult;
        if (sent > 0 || failed > 0) {
          console.log(`✅ Cron job (Premium): ${sent} sent, ${failed} failed, ${remaining || 0} remaining`);
        } else {
          console.log(`📭 Cron job (Premium): No scheduled premium messages to process`);
        }
      } else {
        console.error('❌ Cron job (Premium) failed:', premiumResult?.message || 'Unknown error');
      }

      return { result, premiumResult };
    } catch (error) {
      console.error(`❌ Cron job error (attempt ${retries + 1}):`, error.message);
      retries++;

      if (retries < maxRetries) {
        console.log(`⏳ Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.error('❌ All retry attempts failed');
        return null;
      }
    }
  }
}

function initializeCronJob() {
  if (cronJobInitialized) return;

  // Run every minute to check for scheduled messages
  cron.schedule('* * * * *', async () => {
    console.log(`⏰ [${new Date().toISOString()}] Cron job: Processing scheduled WhatsApp messages (Basic + Premium)...`);

    try {
      await processWithRetry(3);
    } catch (error) {
      console.error('❌ Cron job error:', error.message);
    }
  });

  cronJobInitialized = true;
  console.log('✅ Cron job initialized - Running every minute (Basic + Premium)');
}

/* ================================
   START SERVER
================================ */
const PORT = process.env.PORT || 5000;

// Start the server
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`📱 WhatsApp Mode: SCHEDULED SEND (10 min delay) - Basic + Premium`);

  // Wait for database connection before starting cron job
  let dbConnected = false;
  let attempts = 0;

  while (!dbConnected && attempts < 10) {
    try {
      await connectDB();
      if (mongoose.connection.readyState === 1) {
        dbConnected = true;
        console.log('✅ Database connected successfully');
      }
    } catch (error) {
      console.log(`⏳ Waiting for database connection... (attempt ${attempts + 1}/10)`);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  if (dbConnected) {
    // Initialize admin
    try {
      await initializeDefaultAdmin();
      isAdminInitialized = true;
      console.log("✅ Admin initialized");
    } catch (error) {
      console.error("❌ Admin initialization failed:", error.message);
    }

    // Initialize cron job
    initializeCronJob();

    // Run initial check for pending scheduled messages (Basic + Premium)
    setTimeout(async () => {
      console.log('🔄 Running initial check for pending scheduled messages (Basic + Premium)...');
      await processWithRetry(3);
    }, 5000);
  } else {
    console.error('❌ Failed to connect to database after multiple attempts');
    console.error('⚠️ Cron job will not start without database connection');
  }
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    // Close database connection
    mongoose.connection.close(() => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    // Close database connection
    mongoose.connection.close(() => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

/* ================================
   EXPORT FOR VERCEL
================================ */
module.exports = app;