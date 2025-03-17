import { Server, Socket } from 'socket.io';
import { analyzePose } from '../utils/poseAnalyzer';
import { analyzeStrike } from '../utils/strikeAnalyzer';
import { StrikeData } from '../types/strikes';

// Class to handle WebSocket connections and real-time data processing
export class SocketHandler {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
    this.setupSocketHandlers();
  }

  // Method to set up event listeners for WebSocket connections
  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log('Client connected:', socket.id);

      // Handle real-time pose data
      socket.on('poseData', async (poseData: any) => {
        try {
          const feedback = await analyzePose(poseData);
          socket.emit('poseFeedback', feedback);

          // Send real-time form corrections if needed
          if (feedback.improvements.length > 0) {
            socket.emit('realTimeFeedback', feedback.improvements[0]);
          }
        } catch (error) {
          console.error('Error analyzing pose:', error);
        }
      });

      // Handle strike detection
      socket.on('strikeDetected', async (strikeData: StrikeData) => {
        try {
          const feedback = await analyzeStrike(strikeData);
          socket.emit('strikeFeedback', feedback);
        } catch (error) {
          console.error('Error analyzing strike:', error);
        }
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  // Method to broadcast messages to all connected clients
  broadcastMessage(event: string, data: any) {
    this.io.emit(event, data);
  }

  // Method to send a message to a specific client
  sendToClient(socketId: string, event: string, data: any) {
    this.io.to(socketId).emit(event, data);
  }
}

export default SocketHandler; 