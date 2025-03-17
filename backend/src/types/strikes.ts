export interface StrikeData {
  type: 'jab' | 'cross' | 'hook' | 'uppercut' | 'roundhouse' | 'front_kick' | 'side_kick';
  side: 'left' | 'right';
  speed: number;  // meters per second
  accuracy: number;  // 0-1 scale
  power: number;  // calculated from speed and proper form
  form: {
    hipRotation: number;
    shoulderAlignment: number;
    guardPosition: number;
    kneeAngle?: number;
    hipAngle?: number;
  };
} 