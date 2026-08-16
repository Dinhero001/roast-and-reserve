import express from 'express';
import { readDB, writeDB } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = express.Router();

// Returns whether Paystack keys are set. The secret key itself is never sent
// back to the browser once saved — only whether one exists.
router.get('/paystack', requireAuth, requireAdmin, (req, res) => {
  const db = readDB();
  res.json({
    publicKey: db.settings.paystackPublicKey || '',
    secretKeySet: Boolean(db.settings.paystackSecretKey)
  });
});

router.post('/paystack', requireAuth, requireAdmin, (req, res) => {
  const { publicKey, secretKey } = req.body;
  if (!publicKey || !secretKey) {
    return res.status(400).json({ error: 'Both the public key and secret key are required.' });
  }
  if (!publicKey.startsWith('pk_') || !secretKey.startsWith('sk_')) {
    return res.status(400).json({
      error: "That doesn't look like a valid Paystack key pair (public key starts with pk_, secret key starts with sk_)."
    });
  }

  const db = readDB();
  db.settings.paystackPublicKey = publicKey;
  db.settings.paystackSecretKey = secretKey;
  writeDB(db);
  res.json({ success: true });
});

export default router;
