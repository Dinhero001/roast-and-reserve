import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { readDB, writeDB } from '../db.js';
import { signToken, setAuthCookie, clearAuthCookie, requireAuth } from '../auth.js';

const router = express.Router();

// The very first person to sign up becomes admin automatically.
// Everyone after that is a regular customer account.
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({
      error: 'Name, email, and a password of at least 6 characters are required.'
    });
  }

  const db = readDB();
  const exists = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    role: db.users.length === 0 ? 'admin' : 'customer',
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  writeDB(db);

  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

  const ok = await bcrypt.compare(password || '', user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

export default router;
