const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const timeDataRoutes = require('./routes/timeData');
const feedbackRoutes = require('./routes/feedback');
const emailRoutes = require('./routes/email');
const userRoutes = require('./routes/user');

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['chrome-extension://bkochhokedlbefkobaccicmpphbgeiab'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/time-data', timeDataRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/user', userRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});