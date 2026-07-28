const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const { initializeDefaultAdmin } = require("./controllers/adminController");
const dns = require("dns");

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
    message: "API is running (Instant WhatsApp Mode - No Cron)",
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    whatsapp: "INSTANT_SEND"
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

// WhatsApp routes - instant send only (no cron)
const whatsappRoutes = require('./routes/whatsapp');
app.use('/api/whatsapp', whatsappRoutes.router);

/* ================================
   ROOT
================================ */
app.get("/", (req, res) => {
  res.json({
    message: "AstroPlanets Auth API is running",
    version: "1.0.0",
    mode: "INSTANT_WHATSAPP_SEND",
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
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
   EXPORT FOR VERCEL
================================ */
module.exports = app;

/* ================================
   LOCAL SERVER
================================ */
if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`📱 WhatsApp Mode: INSTANT SEND (No Cron Jobs)`);
  });
}