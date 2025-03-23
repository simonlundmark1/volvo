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
  try {
    // Enable CORS
    await runMiddleware(req, res, corsMiddleware);

    // Connect to database
    try {
      await connectToDB();
    } catch (dbError) {
      return res.status(500).json({ error: 'Database connection failed' });
    }

    // Handle GET requests
    if (req.method === 'GET') {
      try {
        const top = await Hiscore.find().sort({ score: -1 }).limit(10).lean();
        return res.status(200).json(top);
      } catch (error) {
        return res.status(500).json({ error: 'Server error' });
      }
    }

    // Handle POST requests
    if (req.method === 'POST') {
      try {
        if (!req.body) {
          return res.status(400).json({ error: 'Request body is missing' });
        }

        const { name, score } = req.body;
        if (!name || typeof score !== 'number') {
          return res.status(400).json({ error: 'Invalid input' });
        }

        // Create and save in one operation
        await Hiscore.create({
          name: name.slice(0, 16), // Enforce max length
          score
        });

        // Return updated top scores
        const top = await Hiscore.find().sort({ score: -1 }).limit(10).lean();
        return res.status(201).json(top);
      } catch (error) {
        return res.status(500).json({ error: 'Server error' });
      }
    }

    // Handle unsupported methods
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}
