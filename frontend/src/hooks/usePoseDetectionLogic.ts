import { useEffect, useRef, useState, useCallback } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';

interface Keypoint {
  x: number;
  y: number;
  z?: number;
  score: number;
  name: string;
}

interface Pose {
  keypoints: Keypoint[];
  score: number;
}

export function usePoseDetectionLogic(videoRef: React.RefObject<HTMLVideoElement>) {
  const [poses, setPoses] = useState<Pose[]>([]);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const lastFrameTimeRef = useRef<number>(Date.now());

  const detectPose = useCallback(async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!detector || !video || typeof video.readyState === 'undefined') return;

    try {
      const now = Date.now();
      const frameTime = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      if (video.readyState < 2) {
        requestAnimationFrame(detectPose);
        return;
      }

      tf.tidy(() => {
        detector.estimatePoses(video, {
          flipHorizontal: false
        }).then(poses => {
          if (poses && poses.length > 0) {
            setPoses(poses);
          }
        }).catch(error => {
          console.error('Error estimating poses:', error);
        });
      });

      requestAnimationFrame(detectPose);
    } catch (error) {
      console.error('Error in pose detection:', error);
    }
  }, [videoRef]);

  useEffect(() => {
    const initializeDetector = async () => {
      try {
        await tf.ready();
        const model = poseDetection.SupportedModels.BlazePose;
        const detectorConfig = {
          runtime: 'tfjs',
          modelType: 'lite',
          enableSmoothing: true,
          solutionPath: 'path/to/solution'
        };
        const detector = await poseDetection.createDetector(model, detectorConfig);
        detectorRef.current = detector;
        detectPose();
      } catch (error) {
        console.error('Error initializing pose detector:', error);
      }
    };

    initializeDetector();

    return () => {
      if (detectorRef.current) {
        (detectorRef.current as any)?.dispose?.();
      }
    };
  }, [detectPose]);

  return poses;
} 