import { io, Socket } from 'socket.io-client';
import { StrikeData } from '../types/strikes';

interface PoseFeedback {
  accuracy: number;
  feedback: string;
  improvements: string[];
}

interface Keypoint {
  x: number;
  y: number;
  z?: number;
  score: number;
  name: string;
}

interface PoseData {
  keypoints: Keypoint[];
  score: number;
}

// Singleton class to manage WebSocket connections
class SocketService {
  private socket: Socket | null = null;
  private static instance: SocketService;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private lastPoseData: PoseData | null = null;
  private poseDataThrottleTime = 100; // Send pose data every 100ms
  private isConnecting = false;

  private constructor() {}

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  // Method to connect to the WebSocket server
  connect(url: string): Socket | null {
    if (!this.socket) {
      this.socket = io(url, {
        transports: ['websocket'],
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected:', this.socket?.id);
        this.reconnectAttempts = 0; // Reset attempts on successful connection
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        this.handleConnectionError();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        if (reason === 'io server disconnect') {
          this.socket?.connect();
        } else {
          this.handleConnectionError();
        }
      });
    }
    return this.socket;
  }

  // Method to start a heartbeat to keep the connection alive
  private startHeartbeat() {
    if (!this.socket) return;
    
    // Send ping every 25 seconds
    const heartbeat = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping');
      } else {
        clearInterval(heartbeat);
      }
    }, 25000);

    // Handle server pong
    this.socket.on('pong', () => {
      // Connection is alive
      console.debug('Received pong from server');
    });

    // Clean up on disconnect
    this.socket.on('disconnect', () => {
      clearInterval(heartbeat);
    });
  }

  // Method to handle connection errors and attempt reconnection
  private handleConnectionError() {
    this.isConnecting = false;
    this.reconnectAttempts++;
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
      console.log(`Reconnecting in ${delay}ms... Attempt ${this.reconnectAttempts} of ${this.maxReconnectAttempts}`);
      
      setTimeout(() => {
        if (!this.socket?.connected) {
          this.disconnect();
          this.connect(process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000');
        }
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.disconnect();
    }
  }

  // Method to handle disconnection and attempt reconnection
  private handleDisconnect(reason: string) {
    if (reason === 'io server disconnect') {
      // Server initiated disconnect, attempt to reconnect
      setTimeout(() => this.connect(process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'), this.reconnectDelay);
    }
    this.isConnecting = false;
  }

  // Method to disconnect from the WebSocket server
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
  }

  // Method to check if the socket is connected
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Method to send pose data to the server
  sendPoseData(poseData: PoseData) {
    if (!this.socket?.connected) {
      console.log('Socket not connected, attempting to reconnect...');
      this.connect(process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000');
      return;
    }

    // Only send pose data if it's significantly different from the last data
    // or if enough time has passed
    const now = Date.now();
    if (!this.lastPoseData || 
        this.hasSignificantChange(poseData, this.lastPoseData) || 
        !this.lastSentTime || 
        now - this.lastSentTime >= this.poseDataThrottleTime) {
      
      try {
        this.socket.emit('poseData', this.smoothPoseData(poseData));
        this.lastPoseData = poseData;
        this.lastSentTime = now;
      } catch (error) {
        console.error('Error sending pose data:', error);
      }
    }
  }

  private lastSentTime: number | null = null;

  // Method to check for significant changes in pose data
  private hasSignificantChange(current: PoseData, previous: PoseData): boolean {
    // Check if any keypoint has moved significantly
    const threshold = 5; // pixels
    return current.keypoints.some((kp, i) => {
      const prevKp = previous.keypoints[i];
      if (!prevKp || kp.name !== prevKp.name) return true;
      
      const distance = Math.sqrt(
        Math.pow(kp.x - prevKp.x, 2) + 
        Math.pow(kp.y - prevKp.y, 2)
      );
      return distance > threshold;
    });
  }

  // Method to apply smoothing to pose data
  private smoothPoseData(poseData: PoseData): PoseData {
    if (!this.lastPoseData) return poseData;

    // Apply exponential smoothing to keypoints
    const alpha = 0.7; // Smoothing factor (0.0 to 1.0)
    const smoothedKeypoints = poseData.keypoints.map((kp, i) => {
      const prevKp = this.lastPoseData!.keypoints[i];
      if (!prevKp || kp.name !== prevKp.name) return kp;

      return {
        ...kp,
        x: alpha * kp.x + (1 - alpha) * prevKp.x,
        y: alpha * kp.y + (1 - alpha) * prevKp.y,
        z: kp.z !== undefined && prevKp.z !== undefined
          ? alpha * kp.z + (1 - alpha) * prevKp.z
          : kp.z
      };
    });

    return {
      ...poseData,
      keypoints: smoothedKeypoints
    };
  }

  // Method to send strike data to the server
  sendStrikeData(strikeData: StrikeData) {
    if (!this.socket?.connected) {
      console.log('Socket not connected, attempting to reconnect...');
      this.connect(process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000');
      return;
    }

    try {
      this.socket.emit('strikeDetected', strikeData);
    } catch (error) {
      console.error('Error sending strike data:', error);
    }
  }

  // Method to handle pose feedback from the server
  onPoseFeedback(callback: (feedback: PoseFeedback) => void) {
    if (this.socket) {
      this.socket.on('poseFeedback', callback);
    }
  }

  // Method to handle strike feedback from the server
  onStrikeFeedback(callback: (feedback: any) => void) {
    if (this.socket) {
      this.socket.on('strikeFeedback', callback);
    }
  }

  // Method to handle real-time feedback from the server
  onRealTimeFeedback(callback: (feedback: string) => void) {
    if (this.socket) {
      this.socket.on('realTimeFeedback', callback);
    }
  }
}

export default SocketService.getInstance(); 