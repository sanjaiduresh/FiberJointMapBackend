import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jointsRouter from './routes/joints';
import authRouter from './routes/auth';
import cutsRouter from './routes/cuts';
import segmentsRouter from './routes/segments';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in .env');
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set in .env');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/test', (_req, res) => {
  res.json({ status: 'ok', message: 'FiberTrack API is running 🚀', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/joints', jointsRouter);
app.use('/api/cuts', cutsRouter);
app.use('/api/segments', segmentsRouter);

// Connect to MongoDB and start server
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });
