import mongoose from 'mongoose';

const HiscoreSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 16 },
  score: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const Hiscore = mongoose.models.Hiscore || mongoose.model('Hiscore', HiscoreSchema);
