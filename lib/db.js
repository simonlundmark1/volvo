import mongoose from 'mongoose';

let cached = global.mongoose || { conn: null, promise: null };

export async function connectToDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'hiscores',
      bufferCommands: false
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
