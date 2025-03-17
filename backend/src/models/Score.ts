import mongoose from 'mongoose';

const strikeSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['jab', 'cross', 'hook', 'uppercut', 'roundhouse', 'front_kick', 'side_kick']
  },
  side: {
    type: String,
    required: true,
    enum: ['left', 'right']
  },
  speed: {
    type: Number,
    required: true
  },
  accuracy: {
    type: Number,
    required: true
  },
  power: {
    type: Number,
    required: true
  },
  form: {
    hipRotation: Number,
    shoulderAlignment: Number,
    guardPosition: Number,
    kneeAngle: Number,
    hipAngle: Number
  },
  score: {
    type: Number,
    required: true
  }
});

const sessionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  duration: {
    type: Number,
    required: true
  },
  totalStrikes: {
    type: Number,
    required: true
  },
  completedCombos: {
    type: Number,
    required: true
  },
  averageScore: {
    type: Number,
    required: true
  },
  maxComboStreak: {
    type: Number,
    required: true
  },
  strikes: [strikeSchema],
  techniqueBreakdown: {
    type: Map,
    of: {
      count: Number,
      averageScore: Number,
      bestScore: Number
    }
  }
});

// Add indexes for efficient querying
sessionSchema.index({ userId: 1, date: -1 });
sessionSchema.index({ userId: 1, 'techniqueBreakdown.averageScore': -1 });

export const Session = mongoose.model('Session', sessionSchema); 