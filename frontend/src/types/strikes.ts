// Type representing different types of strikes
export type StrikeType = 'jab' | 'cross' | 'hook' | 'uppercut' | 'roundhouse' | 'front_kick' | 'side_kick';

// Type representing the side of the body
export type Side = 'left' | 'right';

// Interface describing the state of movement
export interface MovementState {
  velocity: number;
  direction: { x: number; y: number };
  confidence: number;
  lastUpdate: number;
  smoothedVelocity: number;
  smoothedDirection: { x: number; y: number };
}

// Interface describing data related to a strike
export interface StrikeData {
  type: StrikeType;
  side: Side;
  speed: number;
  accuracy: number;
  power: number;
  form: {
    hipRotation: number;
    shoulderAlignment: number;
    guardPosition: number;
    kneeAngle?: number;
    hipAngle?: number;
  };
} 