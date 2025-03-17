import { Keypoint } from '../types/poses';

// Interface describing movement data for a keypoint
interface MovementData {
  velocity: number;
  direction: { x: number; y: number };
  confidence: number;
  lastUpdate: number;
  smoothedVelocity?: number;
  smoothedDirection?: { x: number; y: number };
}

// Interface for storing historical movement data
export interface MovementHistory {
  timestamps: number[];
  keypoints: Record<string, MovementData[]>;
}

// Constant defining the size of the movement history
const HISTORY_SIZE = 30;

// Constant defining the minimum movement threshold
const MIN_MOVEMENT_THRESHOLD = 0.1;

// Constant defining the smoothing factor for movement data
const SMOOTHING_FACTOR = 0.7;

// Constant defining the scale for velocity calculations
const VELOCITY_SCALE = 100;

// Previous movement states for smoothing
const previousMovements: Record<string, MovementData> = {};

// Function to process keypoints and calculate movement data
export function processMovement(
  keypoints: Keypoint[],
  frameTime: number,
  previousKeypoints?: Keypoint[] | null,
  isFlipped: boolean = true // Default to true since video is usually mirrored
): Record<string, MovementData> {
  const movements: Record<string, MovementData> = {};
  const now = Date.now();

  keypoints.forEach(keypoint => {
    if (keypoint.score < 0.5) return;

    const prevKeypoint = previousKeypoints?.find(kp => kp.name === keypoint.name);
    if (!prevKeypoint) {
      movements[keypoint.name] = {
        velocity: 0,
        direction: { x: 0, y: 0 },
        confidence: keypoint.score,
        lastUpdate: now,
        smoothedVelocity: 0,
        smoothedDirection: { x: 0, y: 0 }
      };
      return;
    }

    // Calculate displacement (handle coordinate flipping)
    const dx = isFlipped ? 
      -(keypoint.x - prevKeypoint.x) : // Flip x-coordinate if video is mirrored
      keypoint.x - prevKeypoint.x;
    const dy = keypoint.y - prevKeypoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate velocity (meters per second)
    const velocity = frameTime > 0 ? (distance * VELOCITY_SCALE) / (frameTime / 1000) : 0;

    // Get previous movement state for smoothing
    const prevMovement = previousMovements[keypoint.name];

    // Calculate smoothed velocity using exponential moving average
    const smoothedVelocity = prevMovement ? 
      prevMovement.smoothedVelocity! * SMOOTHING_FACTOR + velocity * (1 - SMOOTHING_FACTOR) : 
      velocity;

    // Calculate normalized direction
    const direction = {
      x: distance > 0 ? dx / distance : 0,
      y: distance > 0 ? dy / distance : 0
    };

    // Calculate smoothed direction
    const smoothedDirection = prevMovement ? {
      x: prevMovement.smoothedDirection!.x * SMOOTHING_FACTOR + direction.x * (1 - SMOOTHING_FACTOR),
      y: prevMovement.smoothedDirection!.y * SMOOTHING_FACTOR + direction.y * (1 - SMOOTHING_FACTOR)
    } : direction;

    // Only record significant movements
    if (smoothedVelocity >= MIN_MOVEMENT_THRESHOLD) {
      const movementData: MovementData = {
        velocity,
        direction,
        smoothedVelocity,
        smoothedDirection,
        confidence: keypoint.score,
        lastUpdate: now
      };

      movements[keypoint.name] = movementData;
      previousMovements[keypoint.name] = movementData;
    }
  });

  return movements;
}

// Function to calculate a dynamic confidence threshold based on movement history
export function calculateDynamicConfidenceThreshold(
  history: MovementHistory,
  baseThreshold: number = 0.3
): number {
  if (history.timestamps.length === 0) return baseThreshold;

  // Calculate average confidence from recent history
  const recentConfidences = Object.values(history.keypoints)
    .flatMap(data => data.slice(-10))
    .map(data => data.confidence);

  if (recentConfidences.length === 0) return baseThreshold;

  const avgConfidence = recentConfidences.reduce((sum, conf) => sum + conf, 0) / recentConfidences.length;
  
  // Return dynamic threshold (70% of average, but not lower than base)
  return Math.max(baseThreshold, avgConfidence * 0.7);
} 