import { connectToDB } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    // Try to connect to MongoDB but with a short timeout
    const start = Date.now();
    await connectToDB();
    const connectTime = Date.now() - start;

    return res.status(200).json({
      status: 'ok',
      message: 'API is working',
      mongodb: 'connected',
      connectTime: `${connectTime}ms`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'API is working but MongoDB connection failed',
      error: error.message
    });
  }
}
