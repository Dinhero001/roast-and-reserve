import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './src/routes/auth.js';
import settingsRoutes from './src/routes/settings.js';
import orderRoutes from './src/routes/orders.js';
import webhookRoutes from './src/routes/webhook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(cookieParser());

// The webhook route needs the RAW, unparsed body to verify Paystack's signature,
// so it's mounted before the global JSON parser below.
app.use('/api/webhook', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/orders', orderRoutes);

// Paystack redirects the customer's browser here after payment.
// Hand off straight back to the storefront, which looks for ?reference= on
// load and verifies the payment itself.
app.get('/checkout/callback', (req, res) => {
  res.redirect(`/?reference=${encodeURIComponent(req.query.reference || '')}`);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
