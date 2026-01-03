
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuid } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer();

// In-memory data stores (local dev)
const users = [];
const photos = [
  {
    id: uuid(),
    url: "https://picsum.photos/800/600",
    title: "Sample Photo",
    creator: "System",
    reactions: { like: 2, love: 1, sad: 0, hate: 0 },
    comments: [{ user: "Admin", text: "Welcome to PhotoSphere!" }],
    shares: 1
  }
];

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.sendStatus(401);
  try {
    req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.sendStatus(403);
  }
}

// Register
app.post('/api/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (users.find(u => u.email === email))
    return res.status(400).json({ error: 'User exists' });

  const hashed = await bcrypt.hash(password, 10);
  users.push({ id: uuid(), name, email, password: hashed, role });
  res.json({ message: 'Registered' });
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET
  );
  res.json({ token, role: user.role });
});

// Upload photo (creator)
app.post('/api/photos', auth, upload.single('image'), (req, res) => {
  if (req.user.role !== 'creator') return res.sendStatus(403);

  const photo = {
    id: uuid(),
    url: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
    title: req.body.title,
    creator: req.user.name,
    reactions: { like: 0, love: 0, sad: 0, hate: 0 },
    comments: [],
    shares: 0
  };
  photos.unshift(photo);
  res.json(photo);
});

// Feed
app.get('/api/photos', (req, res) => {
  res.json(photos);
});

// React
app.post('/api/photos/:id/react/:type', auth, (req, res) => {
  const photo = photos.find(p => p.id === req.params.id);
  if (!photo) return res.sendStatus(404);
  photo.reactions[req.params.type]++;
  res.json(photo.reactions);
});

// Comment
app.post('/api/photos/:id/comment', auth, (req, res) => {
  const photo = photos.find(p => p.id === req.params.id);
  photo.comments.push({ user: req.user.name, text: req.body.text });
  res.json(photo.comments);
});

// Share
app.post('/api/photos/:id/share', auth, (req, res) => {
  const photo = photos.find(p => p.id === req.params.id);
  photo.shares++;
  res.json({ shares: photo.shares });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PhotoSphere FINAL running on port ${PORT}`));
