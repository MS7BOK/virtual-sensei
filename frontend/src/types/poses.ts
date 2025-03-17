// Interface representing a keypoint in a pose
export interface Keypoint {
  x: number;
  y: number;
  z?: number;
  score: number;
  name: string;
}

// Interface representing a pose with keypoints and a score
export interface Pose {
  keypoints: Keypoint[];
  score: number;
}

// Interface describing a pose detector capable of estimating poses
export interface PoseDetector {
  estimatePoses: (
    image: HTMLVideoElement,
    config?: { flipHorizontal: boolean }
  ) => Promise<Pose[]>;
}

// Interface for configuration options for the pose detector
export interface DetectorConfig {
  runtime: 'tfjs';
  modelType: 'lite' | 'full' | 'heavy';
  enableSmoothing?: boolean;
  scoreThreshold?: number;
  minPoseScore?: number;
  multiPoseMaxDimension?: number;
} 