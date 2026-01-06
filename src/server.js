require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuid } = require('uuid');

const app = express();

/* =========================
   CONFIG (AZURE SAFE)
========================= */
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

/* =========================
   STARTUP LOG (IMPORTANT)
========================= */
console.log('🔥 PhotoSphere backend starting...');
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

/* =========================
   MIDDLEWARE
========================= */

// Request logging (shows activity in Log Stream)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// CORS (frontend → backend)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

/* =========================
   IN-MEMORY DATA (DEV / DEMO)
========================= */
const users = [];

const photos = [
  {
    id: uuid(),
    url: 'https://picsum.photos/900/600',
    title: 'Welcome to PhotoSphere',
    creator: 'System',
    reactions: { like: 4, love: 3, wow: 2, sad: 0 },
    comments: [{ user: 'Admin', text: 'Enjoy the platform 🚀' }],
    shares: 2
  }
];

/* =========================
   AUTH MIDDLEWARE
========================= */
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(403).json({ error: 'Invalid token' });
  }
}

/* =========================
   ROUTES
========================= */

// Health check (useful for Azure testing)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

/* ---------- AUTH ---------- */

// Register
app.post('/api/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields required' });
  }

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'User already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  users.push({
    id: uuid(),
    name,
    email,
    password: hashedPassword,
    role
  });

  console.log(`✅ User registered: ${email}`);
  res.json({ message: 'Registration successful' });
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  console.log(`🔐 User logged in: ${email}`);
  res.json({ token, role: user.role });
});

/* ---------- FEED ---------- */

// Get photos
app.get('/api/photos', (req, res) => {
  res.json(photos);
});

// Upload photo (creator only)
app.post('/api/photos', auth, upload.single('image'), (req, res) => {
  if (req.user.role !== 'creator') {
    return res.status(403).json({ error: 'Creators only' });
  }

  if (!req.file || !req.body.title) {
    return res.status(400).json({ error: 'Image and title required' });
  }

  const photo = {
    id: uuid(),
    url: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
    title: req.body.title,
    creator: req.user.name,
    reactions: { like: 0, love: 0, wow: 0, sad: 0 },
    comments: [],
    shares: 0
  };

  photos.unshift(photo);
  console.log(`📸 Photo uploaded by ${req.user.name}`);
  res.json(photo);
});

// React
app.post('/api/photos/:id/react/:type', auth, (req, res) => {
  const photo = photos.find(p => p.id === req.params.id);
  if (!photo) return res.sendStatus(404);

  const type = req.params.type;
  photo.reactions[type] = (photo.reactions[type] || 0) + 1;

  console.log(`👍 Reaction '${type}' added`);
  res.json(photo.reactions);
});

// Comment
app.post('/api/photos/:id/comment', auth, (req, res) => {
  const photo = photos.find(p => p.id === req.params.id);
  if (!photo) return res.sendStatus(404);

  if (!req.body.text) {
    return res.status(400).json({ error: 'Comment text required' });
  }

  photo.comments.push({
    user: req.user.name,
    text: req.body.text
  });

  console.log(`💬 Comment added by ${req.user.name}`);
  res.json(photo.comments);
});

// Share
app.post('/api/photos/:id/share', auth, (req, res) => {
  const photo = photos.find(p => p.id === req.params.id);
  if (!photo) return res.sendStatus(404);

  photo.shares++;
  console.log(`🔗 Photo shared`);
  res.json({ shares: photo.shares });
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`🚀 PhotoSphere API running on port ${PORT}`);
});
