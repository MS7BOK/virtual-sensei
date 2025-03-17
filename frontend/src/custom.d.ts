declare module '@tensorflow-models/pose-detection' {
  export interface Keypoint {
    x: number;
    y: number;
    z?: number;
    score: number;
    name: string;
  }

  export interface Pose {
    keypoints: Keypoint[];
    score: number;
  }

  export interface PoseDetector {
    estimatePoses(
      image: HTMLVideoElement,
      config?: { flipHorizontal: boolean }
    ): Promise<Pose[]>;
  }

  export enum SupportedModels {
    BlazePose = 'BlazePose'
  }

  export function createDetector(
    model: SupportedModels,
    config: {
      runtime: string;
      modelType: string;
      solutionPath: string;
    }
  ): Promise<PoseDetector>;
}

declare module '@tensorflow/tfjs-backend-webgl';
declare module '@mediapipe/pose'; 