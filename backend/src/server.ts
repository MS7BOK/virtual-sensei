import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { startSession, endSession } from './services/sessionService';
import winston from 'winston';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Security middleware with adjusted settings for WebSocket
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  contentSecurityPolicy: false
}));

// Configure CORS with WebSocket support
const corsOptions = {
  origin: process.env.CORS_ORIGIN || true, // Set specific origin for production
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Socket.io setup with adjusted settings
const io = new Server(httpServer, {
  cors: {
    origin: true, // Allow all origins in development
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 10000,
  maxHttpBufferSize: 1e6,
  path: '/socket.io/' // Explicitly set the path
});

// Middleware
app.use(express.json({ limit: '1mb' }));

// Basic routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Session management routes
app.post('/api/score/session/start', (req, res) => {
  try {
    const sessionData = startSession();
    res.json(sessionData);
  } catch (error) {
    logger.error('Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

app.post('/api/score/session/:sessionId/end', (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionData = endSession(sessionId);
    res.json(sessionData);
  } catch (error) {
    logger.error('Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Socket connection handling
io.on('connection', (socket) => {
  logger.info('Client connected:', socket.id);

  // Send immediate acknowledgment
  socket.emit('connect_ack', { id: socket.id });

  // Handle ping-pong for connection health check
  socket.on('ping', () => {
    socket.emit('pong');
  });

  socket.on('poseData', (data) => {
    try {
      const feedback = analyzePose(data);
      socket.emit('poseFeedback', feedback);
    } catch (error) {
      logger.error('Error processing pose data:', error);
      socket.emit('error', { message: 'Error processing pose data' });
    }
  });

  socket.on('disconnect', (reason) => {
    logger.info('Client disconnected:', socket.id, 'Reason:', reason);
  });

  socket.on('error', (error) => {
    logger.error('Socket error for client', socket.id, ':', error);
  });
});

// Error handling for the HTTP server
httpServer.on('error', (error) => {
  logger.error('Server error:', error);
});

// Start the server
const PORT = process.env.PORT || 5000;

// Ensure the server is actually listening
const server = httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready at ws://localhost:${PORT}`);
  console.log('CORS settings:', corsOptions.origin);
});

// Handle server shutdown gracefully
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Closing HTTP server...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Implement pose analysis logic
function analyzePose(data: any) {
  // Example implementation
  const accuracy = Math.random() * 100;
  const feedback = accuracy > 80 ? 'Good posture!' : 'Needs improvement.';
  const improvements = accuracy > 80 ? [] : ['Keep your back straight', 'Maintain proper stance'];
  return {
    accuracy,
    feedback,
    improvements
  };
} 