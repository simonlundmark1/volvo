import { connectToDB } from '../../lib/db.js';
import { Hiscore } from '../../models/Hiscore.js';
import cors from 'cors';

// Initialize CORS middleware
const corsMiddleware = cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: false
});

// Helper to run middleware
const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

export default async function handler(req, res) {
  // Enable CORS
  await runMiddleware(req, res, corsMiddleware);

  // Connect to database
  await connectToDB();

  // Handle GET requests
  if (req.method === 'GET') {
    try {
      const top = await Hiscore.find().sort({ score: -1 }).limit(10);
      return res.status(200).json(top);
    } catch (error) {
      console.error('Error fetching hiscores:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  // Handle POST requests
  if (req.method === 'POST') {
    try {
      const { name, score } = req.body;

      if (!name || name.length > 16 || typeof score !== 'number') {
        return res.status(400).json({ error: 'Invalid input' });
      }

      const entry = new Hiscore({ name, score });
      await entry.save();

      // Return updated top scores
      const top = await Hiscore.find().sort({ score: -1 }).limit(10);
      return res.status(201).json(top);
    } catch (error) {
      console.error('Error saving hiscore:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  // Handle unsupported methods
  return res.status(405).end();
}
