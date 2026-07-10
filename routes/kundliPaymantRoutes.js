const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { protect } = require('../middleware/auth');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// @route   POST /api/kundlipayments/create-order
// @desc    Create Razorpay order
// @access  Private
router.post('/create-order', protect, async (req, res) => {
  try {
    // Fixed amount: ₹99 (9900 paise)
    const AMOUNT = 99;
    const { currency = 'INR' } = req.body;

    const options = {
      amount: AMOUNT * 100, // Amount in paise (99 * 100 = 9900 paise = ₹99)
      currency: currency,
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1,
      notes: {
        purpose: 'Kundli Generation'
      }
    };

    const order = await razorpay.orders.create(options);

    console.log(`✅ Order created: ₹${AMOUNT}`);

    res.json({
      success: true,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      amount_in_rupees: AMOUNT
    });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
});

// @route   POST /api/kundlipayments/verify-payment
// @desc    Verify Razorpay payment
// @access  Private
router.post('/verify-payment', protect, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

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
        message: 'Payment verified successfully'
      });
    } else {
      console.error(`❌ Invalid signature for order: ${razorpay_order_id}`);
      res.status(400).json({
        success: false,
        message: 'Invalid signature'
      });
    }
  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

module.exports = router;