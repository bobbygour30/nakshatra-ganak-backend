const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// @route   POST /api/kundlipayments/create-order
// @desc    Create Razorpay order
// @access  Public (No auth required)
const TEST_MODE = true;

router.post('/create-order', async (req, res) => {
  try {
    // Production mode: ₹99 (9900 paise)
    const amount = 99;
    const { currency = 'INR' } = req.body;

    const options = {
      amount: amount * 100,
      currency: currency,
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1,
      notes: {
        purpose: 'Kundli Generation',
        is_test: 'false'
      }
    };

    const order = await razorpay.orders.create(options);

    console.log(`✅ Order created: ₹${amount}`);

    res.json({
      success: true,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      amount_in_rupees: amount
    });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create order',
      error: err.message 
    });
  }
});

// @route   POST /api/kundlipayments/verify-payment
// @desc    Verify Razorpay payment
// @access  Public (No auth required)
router.post('/verify-payment', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment verification fields'
      });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      console.log(`✅ Payment verified successfully for order: ${razorpay_order_id}`);
      res.json({
        success: true,
        message: 'Payment verified successfully',
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id
      });
    } else {
      console.error(`❌ Invalid signature for order: ${razorpay_order_id}`);
      res.status(400).json({
        success: false,
        message: 'Invalid signature - Payment verification failed'
      });
    }
  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Payment verification failed',
      error: err.message 
    });
  }
});

// @route   GET /api/kundlipayments/payment-status/:paymentId
// @desc    Get payment status
// @access  Public (No auth required)
router.get('/payment-status/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment ID is required'
      });
    }

    const payment = await razorpay.payments.fetch(paymentId);
    
    res.json({
      success: true,
      payment: {
        id: payment.id,
        status: payment.status,
        amount: payment.amount / 100,
        currency: payment.currency,
        method: payment.method,
        bank: payment.bank,
        created_at: payment.created_at
      }
    });
  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment status',
      error: error.message
    });
  }
});

// @route   POST /api/kundlipayments/set-mode
// @desc    Set payment mode (test/production)
// @access  Public (No auth required)
router.post('/set-mode', async (req, res) => {
  try {
    const { mode } = req.body;
    
    if (!mode || !['test', 'production'].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mode. Use "test" or "production"'
      });
    }

    const amount = mode === 'test' ? 1 : 99;
    
    res.json({
      success: true,
      message: `Mode set to ${mode}`,
      mode: mode,
      amount: amount,
      amount_in_paise: amount * 100
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

// @route   GET /api/kundlipayments/config
// @desc    Get payment configuration
// @access  Public (No auth required)
router.get('/config', async (req, res) => {
  try {
    res.json({
      success: true,
      config: {
        key_id: process.env.RAZORPAY_KEY_ID,
        amount: 99,
        currency: 'INR',
        test_mode: false
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get config'
    });
  }
});

module.exports = router;