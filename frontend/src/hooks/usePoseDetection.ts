import { useEffect, useState, useCallback } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';

type DetectorConfig = {
  runtime: 'tfjs' | 'mediapipe';
  modelType: 'lite' | 'full';
  enableSmoothing: boolean;
  solutionPath: string;
};

export function usePoseDetection(videoRef: React.RefObject<HTMLVideoElement>) {
  const [poses, setPoses] = useState<poseDetection.Pose[]>([]);

  useEffect(() => {
    let detector: poseDetection.PoseDetector | null = null;
    let animationFrameId: number;

    const loadDetector = async () => {
      try {
        const model = poseDetection.SupportedModels.BlazePose;
        const detectorConfig = {
          runtime: 'tfjs',
          modelType: 'lite',
          enableSmoothing: true,
          solutionPath: 'path/to/solution'
        };
        detector = await poseDetection.createDetector(model, detectorConfig);
      } catch (error) {
        console.error('Error loading pose detector:', error);
      }
    };

    const detectPoses = useCallback(async () => {
      try {
        if (detector && videoRef.current) {
          const estimatedPoses = await detector.estimatePoses(videoRef.current);
          setPoses(estimatedPoses);
        }
      } catch (error) {
        console.error('Error detecting poses:', error);
      }
      animationFrameId = requestAnimationFrame(detectPoses);
    }, [detector, videoRef]);

    loadDetector().then(detectPoses);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (detector) {
        (detector as any)?.dispose?.();
      }
    };
  }, [videoRef]);

  return poses;
} 