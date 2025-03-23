import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { Hiscore } from './models/Hiscore.js';

dotenv.config();

const app = express();
app.use(cors({
  origin: '*', // Allow requests from any origin in development
  methods: ['GET', 'POST'],
  credentials: false
}));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ DB connection error:', err));

app.get('/api/hiscores', async (req, res) => {
  try {
    const top = await Hiscore.find().sort({ score: -1 }).limit(10);
    res.json(top);
  } catch (error) {
    console.error('Error fetching hiscores:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/hiscores', async (req, res) => {
  try {
    const { name, score } = req.body;

    if (!name || name.length > 16 || typeof score !== 'number') {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const entry = new Hiscore({ name, score });
    await entry.save();

    // Return updated top scores
    const top = await Hiscore.find().sort({ score: -1 }).limit(10);
    res.status(201).json(top);
  } catch (error) {
    console.error('Error saving hiscore:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🎮 Backend listening on http://localhost:${PORT}`);
});
