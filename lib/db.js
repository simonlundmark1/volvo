import mongoose from 'mongoose';

// Keep track of the connection across function invocations
let cached = global.mongoose || { conn: null, promise: null };
if (!global.mongoose) {
  global.mongoose = cached;
}

export async function connectToDB() {
  // If no MongoDB URI is provided, throw a clear error
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  // If already connected, return existing connection
  if (cached.conn) {
    return cached.conn;
  }

  // If connection in progress, wait for it
  if (cached.promise) {
    cached.conn = await cached.promise;
    return cached.conn;
  }

  const opts = {
    bufferCommands: false,
    connectTimeoutMS: 5000, // Shorter timeout
    maxPoolSize: 5, // Limit concurrent connections
    serverSelectionTimeoutMS: 5000, // Faster server selection
  };

  cached.promise = mongoose.connect(process.env.MONGODB_URI, opts);

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
}
