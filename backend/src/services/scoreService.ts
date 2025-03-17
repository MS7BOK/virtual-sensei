import { Session } from '../models/Score';
import { StrikeData } from '../types/strikes';

interface SessionStats {
  totalStrikes: number;
  completedCombos: number;
  averageScore: number;
  maxComboStreak: number;
  techniqueBreakdown: Map<string, {
    count: number;
    averageScore: number;
    bestScore: number;
  }>;
}

export class ScoreService {
  private static calculateStrikeScore(strike: StrikeData): number {
    // Speed weight: 30%
    // Power weight: 40%
    // Form weight: 30%
    
    // Normalize speed score (assuming max speed is 10 m/s)
    const speedScore = Math.min(strike.speed / 10, 1) * 30;
    
    // Power is already normalized (0-1)
    const powerScore = strike.power * 40;
    
    // Calculate form score from various components
    const formComponents = [
      strike.form.hipRotation / 90, // Normalize to 90 degrees
      strike.form.shoulderAlignment / 180, // Normalize to 180 degrees
      strike.form.guardPosition, // Already normalized
      strike.accuracy // Already normalized
    ];
    
    if (strike.type.includes('kick')) {
      formComponents.push(
        (strike.form.kneeAngle || 0) / 90, // Normalize to 90 degrees
        (strike.form.hipAngle || 0) / 90 // Normalize to 90 degrees
      );
    }
    
    const formScore = (formComponents.reduce((sum, val) => sum + val, 0) / formComponents.length) * 30;
    
    return Math.round(speedScore + powerScore + formScore);
  }

  private static updateTechniqueStats(
    breakdown: Map<string, { count: number; averageScore: number; bestScore: number }>,
    technique: string,
    score: number
  ) {
    const stats = breakdown.get(technique) || { count: 0, averageScore: 0, bestScore: 0 };
    const newCount = stats.count + 1;
    const newAverage = ((stats.averageScore * stats.count) + score) / newCount;
    const newBest = Math.max(stats.bestScore, score);
    
    breakdown.set(technique, {
      count: newCount,
      averageScore: newAverage,
      bestScore: newBest
    });
    
    return breakdown;
  }

  static async startSession(userId: string): Promise<string> {
    const session = new Session({
      userId,
      totalStrikes: 0,
      completedCombos: 0,
      averageScore: 0,
      maxComboStreak: 0,
      duration: 0,
      strikes: [],
      techniqueBreakdown: new Map()
    });

    await session.save();
    return session._id.toString();
  }

  static async addStrike(
    sessionId: string,
    strike: StrikeData,
    sessionStats: SessionStats
  ): Promise<number> {
    const score = this.calculateStrikeScore(strike);
    
    const session = await Session.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Add the strike with its score
    session.strikes.push({
      ...strike,
      score: score
    });

    // Update session statistics
    session.totalStrikes = sessionStats.totalStrikes;
    session.completedCombos = sessionStats.completedCombos;
    session.maxComboStreak = sessionStats.maxComboStreak;
    
    // Calculate new average score
    const totalScore = session.strikes.reduce((sum, s) => sum + (s.score || 0), 0);
    session.averageScore = totalScore / session.strikes.length;

    // Update technique breakdown
    const technique = `${strike.side}_${strike.type}`;
    const techniqueBreakdown = session.techniqueBreakdown || new Map();
    session.techniqueBreakdown = this.updateTechniqueStats(
      techniqueBreakdown,
      technique,
      score
    );

    await session.save();
    return score;
  }

  static async endSession(sessionId: string): Promise<SessionStats> {
    const session = await Session.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.duration = Date.now() - session.date.getTime();
    await session.save();

    return {
      totalStrikes: session.totalStrikes,
      completedCombos: session.completedCombos,
      averageScore: session.averageScore,
      maxComboStreak: session.maxComboStreak,
      techniqueBreakdown: session.techniqueBreakdown || new Map()
    };
  }

  static async getSessionHistory(userId: string, limit = 10): Promise<any[]> {
    return Session.find({ userId })
      .sort({ date: -1 })
      .limit(limit)
      .select('-strikes') // Exclude individual strikes for performance
      .lean();
  }

  static async getTechniqueProgress(userId: string, technique: string): Promise<any[]> {
    return Session.find({
      userId,
      [`techniqueBreakdown.${technique}`]: { $exists: true }
    })
      .sort({ date: -1 })
      .limit(10)
      .select('date techniqueBreakdown')
      .lean();
  }
} 