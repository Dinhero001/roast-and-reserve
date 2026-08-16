import express from 'express';
import crypto from 'crypto';
import { readDB, writeDB } from '../db.js';
import { requireAuth } from '../auth.js';

const router = express.Router();

// Prices live on the SERVER, not the browser — this is what stops someone from
// editing the page and checking out for ₦1. Keep this in sync with your storefront.
const PRODUCTS = {
  p1: { name: 'Yirgacheffe', price: 8500 },
  p2: { name: 'Huila Reserve', price: 9200 },
  p3: { name: 'Sumatra Mandheling', price: 8800 },
  p4: { name: 'Kenya AA', price: 9600 }
};
const PLANS = {
  s1: { name: 'Weekly subscription', price: 7000 },
  s2: { name: 'Biweekly subscription', price: 8000 },
  s3: { name: 'Monthly subscription', price: 8800 }
};

router.post('/checkout', requireAuth, async (req, res) => {
  const { items, email } = req.body; // items: [{ id, qty }]
  const db = readDB();

  if (!db.settings.paystackSecretKey) {
    return res.status(400).json({
      error: 'Paystack has not been set up yet. An admin needs to add the keys in /admin.html first.'
    });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty.' });
  }

  let amount = 0;
  const lineItems = [];
  for (const item of items) {
    const catalogItem = PRODUCTS[item.id] || PLANS[item.id];
    if (!catalogItem) return res.status(400).json({ error: `Unknown item: ${item.id}` });
    const qty = PLANS[item.id] ? 1 : Math.max(1, item.qty || 1);
    amount += catalogItem.price * qty;
    lineItems.push({ id: item.id, name: catalogItem.name, qty, price: catalogItem.price });
  }

  const reference = 'RR-' + crypto.randomUUID().split('-')[0].toUpperCase();
  const order = {
    id: crypto.randomUUID(),
    reference,
    userId: req.user.id,
    email: email || req.user.email,
    items: lineItems,
    amount,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  db.orders.push(order);
  writeDB(db);

  try {
    const psRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${db.settings.paystackSecretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: order.email,
        amount: amount * 100, // Paystack expects the amount in kobo
        reference,
        callback_url: `${process.env.APP_URL || 'http://localhost:4000'}/checkout/callback`
      })
    });
    const psData = await psRes.json();
    if (!psRes.ok || !psData.status) {
      return res.status(502).json({ error: psData.message || 'Paystack could not start this payment.' });
    }
    res.json({ authorizationUrl: psData.data.authorization_url, reference });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Paystack. Please try again shortly.' });
  }
});

// Called after the customer returns from Paystack, to confirm payment actually succeeded.
router.get('/verify/:reference', requireAuth, async (req, res) => {
  const db = readDB();
  const order = db.orders.find(o => o.reference === req.params.reference);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.status === 'paid') return res.json({ order });

  try {
    const psRes = await fetch(`https://api.paystack.co/transaction/verify/${order.reference}`, {
      headers: { Authorization: `Bearer ${db.settings.paystackSecretKey}` }
    });
    const psData = await psRes.json();
    if (psData.status && psData.data.status === 'success') {
      order.status = 'paid';
      order.paidAt = new Date().toISOString();
      writeDB(db);
    }
    res.json({ order });
  } catch (err) {
    res.status(502).json({ error: 'Could not verify with Paystack right now.' });
  }
});

router.get('/mine', requireAuth, (req, res) => {
  const db = readDB();
  const orders = db.orders.filter(o => o.userId === req.user.id);
  res.json({ orders });
});

export default router;
