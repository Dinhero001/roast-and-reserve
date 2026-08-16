import express from 'express';
import crypto from 'crypto';
import { readDB, writeDB } from '../db.js';

const router = express.Router();

// This is the SOURCE OF TRUTH for "did the customer actually pay" — the browser
// redirect after checkout can be closed, refreshed, or interrupted, but Paystack
// will always call this webhook when a payment succeeds.
// It needs the raw, unparsed request body to check the signature, which is why
// it's mounted with express.raw() in server.js instead of the normal JSON parser.
router.post('/paystack', (req, res) => {
  const db = readDB();
  const secret = db.settings.paystackSecretKey;
  if (!secret) return res.status(400).send('Paystack not configured');

  const signature = req.headers['x-paystack-signature'];
  const hash = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
  if (hash !== signature) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(req.body.toString());
  if (event.event === 'charge.success') {
    const reference = event.data.reference;
    const order = db.orders.find(o => o.reference === reference);
    if (order && order.status !== 'paid') {
      order.status = 'paid';
      order.paidAt = new Date().toISOString();
      writeDB(db);
    }
  }

  res.sendStatus(200);
});

export default router;
