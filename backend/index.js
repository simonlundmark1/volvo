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

// Add a simple welcome route for the root path
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Volvo Game Backend</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #1a56db; }
          .endpoint { background: #f3f4f6; padding: 10px; border-radius: 4px; margin-bottom: 10px; }
          code { background: #e5e7eb; padding: 2px 4px; border-radius: 2px; }
        </style>
      </head>
      <body>
        <h1>Volvo Game Backend API</h1>
        <p>The API is running correctly! Here are the available endpoints:</p>

        <div class="endpoint">
          <h3>GET /api/hiscores</h3>
          <p>Fetches the top 10 highscores.</p>
          <p>Try it: <a href="/api/hiscores" target="_blank">/api/hiscores</a></p>
        </div>

        <div class="endpoint">
          <h3>POST /api/hiscores</h3>
          <p>Saves a new highscore.</p>
          <p>Required JSON body: <code>{ "name": "PlayerName", "score": 1234 }</code></p>
        </div>

        <p>Status: MongoDB is connected and ready to store highscores.</p>
      </body>
    </html>
  `);
});

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
