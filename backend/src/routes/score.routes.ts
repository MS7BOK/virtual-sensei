import { Router } from 'express';
import { ScoreService } from '../services/scoreService';

const router = Router();

// Start a new training session
router.post('/session/start', async (req, res) => {
  try {
    const { userId } = req.body;
    const sessionId = await ScoreService.startSession(userId);
    res.json({ sessionId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// Add a strike to the current session
router.post('/session/:sessionId/strike', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { strike, sessionStats } = req.body;
    
    const score = await ScoreService.addStrike(sessionId, strike, sessionStats);
    res.json({ score });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record strike' });
  }
});

// End the current session
router.post('/session/:sessionId/end', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const stats = await ScoreService.endSession(sessionId);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Get session history
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit } = req.query;
    const history = await ScoreService.getSessionHistory(userId, Number(limit) || 10);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch session history' });
  }
});

// Get technique progress
router.get('/technique/:userId/:technique', async (req, res) => {
  try {
    const { userId, technique } = req.params;
    const progress = await ScoreService.getTechniqueProgress(userId, technique);
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch technique progress' });
  }
});

export const scoreRouter = router; 