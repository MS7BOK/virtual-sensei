import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-wasm';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import * as poseDetection from '@tensorflow-models/pose-detection';
import '@mediapipe/pose';
import { StrikeType, StrikeData, MovementState, Side } from '../types/strikes';
import { analyzeTechnique, getSpeedFeedback, getPowerFeedback } from '../utils/techniqueAnalyzer';
import { generateCoachFeedback, getMotivationalMessage, getComboFeedback } from '../utils/coachFeedback';
import axios, { AxiosError, AxiosResponse } from 'axios';
import socketService from '../services/socketService';
import { debounce } from 'lodash';
import { processMovement } from '../utils/movementProcessor';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { useSocket } from '../hooks/useSocket';
import ErrorBoundary from './ErrorBoundary';

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

interface Pose {
  keypoints: Keypoint[];
  score: number;
}

interface PoseDetector {
  estimatePoses: (
    image: HTMLVideoElement,
    config?: { flipHorizontal: boolean }
  ) => Promise<Pose[]>;
}

interface DetectorConfig {
  runtime: 'tfjs';
  modelType: 'lite' | 'full' | 'heavy';
  enableSmoothing?: boolean;
  solutionPath: string;
}

interface ActiveFeedback {
  message: string;
  type: 'info' | 'warning' | 'success';
  timestamp: number;
  category?: string;
}

interface SessionStats {
  totalStrikes: number;
  completedCombos: number;
  averageScore: number;
  maxComboStreak: number;
  startTime: number;
}

interface PoseDetectionState {
  keypoints: Keypoint[];
  isVideoStopped: boolean;
  error: string | null;
  coachMode: boolean;
  successStreak: number;
  completedCombos: number;
  sessionId: string | null;
}

interface SessionResponse {
  sessionId: string;
}

const PoseDetection: React.FC = () => {
  const [state, setState] = useState<PoseDetectionState>({
    keypoints: [],
    isVideoStopped: false,
    error: null,
    coachMode: false,
    successStreak: 0,
    completedCombos: 0,
    sessionId: null
  });

  const [detector, setDetector] = useState<PoseDetector | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const poses: Pose[] = usePoseDetection(videoRef);

  const getMovementData = useCallback((keypoint: Keypoint) => {
    const state = movementStateRef.current[keypoint.name];
    return state || { 
      velocity: 0, 
      direction: { x: 0, y: 0 }, 
      confidence: keypoint.score,
      lastUpdate: Date.now(),
      smoothedVelocity: 0,
      smoothedDirection: { x: 0, y: 0 }
    };
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const movementHistoryCleanupRef = useRef<NodeJS.Timeout | null>(null);
  const { socket, isConnected } = useSocket('http://localhost:5000');
  const [feedback, setFeedback] = useState<PoseFeedback | null>(null);
  const [detectedStrike, setDetectedStrike] = useState<StrikeData | null>(null);
  const previousPoseRef = useRef<Pose | null>(null);
  const lastStrikeTimeRef = useRef<number>(0);
  const [techniqueAnalysis, setTechniqueAnalysis] = useState<{
    isCorrect: boolean;
    score: number;
    improvements: string[];
    overallFeedback: string;
  } | null>(null);
  const [activeFeedback, setActiveFeedback] = useState<ActiveFeedback[]>([]);
  const activeFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFeedbackTimeRef = useRef<Record<string, number>>({});
  const [currentExercise, setCurrentExercise] = useState<string | null>(null);
  const [exerciseStep, setExerciseStep] = useState<number>(0);
  const [coachMode, setCoachMode] = useState<boolean>(false);
  const [successStreak, setSuccessStreak] = useState<number>(0);
  const [completedCombos, setCompletedCombos] = useState<number>(0);
  const [lastCoachMessage, setLastCoachMessage] = useState<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    totalStrikes: 0,
    completedCombos: 0,
    averageScore: 0,
    maxComboStreak: 0,
    startTime: Date.now()
  });

  const [showDebugInfo, setShowDebugInfo] = useState(true);
  const [keypointData, setKeypointData] = useState<string>('');

  const [movementHistory, setMovementHistory] = useState<{
    keypoints: { [key: string]: { x: number; y: number; confidence: number; velocity: number }[] };
    timestamps: number[];
    confidenceHistory: number[];
  }>({
    keypoints: {},
    timestamps: [],
    confidenceHistory: []
  });

  const lastFrameTimeRef = useRef<number>(Date.now());

  const exercises = useMemo(() => [
    { name: 'Jab', instructions: 'Perform a left jab with full extension' },
    { name: 'Cross', instructions: 'Follow with a right cross, rotating your hips' },
    { name: 'Roundhouse', instructions: 'Complete with a right roundhouse kick' }
  ], []);

  const skeletonConnections = useRef<[string, string][]>([
    ['left_shoulder', 'right_shoulder'],
    ['left_shoulder', 'left_elbow'],
    ['right_shoulder', 'right_elbow'],
    ['left_elbow', 'left_wrist'],
    ['right_elbow', 'right_wrist'],
    ['left_shoulder', 'left_hip'],
    ['right_shoulder', 'right_hip'],
    ['left_hip', 'right_hip'],
    ['left_hip', 'left_knee'],
    ['right_hip', 'right_knee'],
    ['left_knee', 'left_ankle'],
    ['right_knee', 'right_ankle']
  ]);

  const calculateAngle = useCallback((p1: Keypoint, p2: Keypoint, p3: Keypoint): number => {
    const angle = Math.atan2(
      p3.y - p2.y,
      p3.x - p2.x
    ) - Math.atan2(
      p1.y - p2.y,
      p1.x - p2.x
    );
    return Math.abs((angle * 180) / Math.PI);
  }, []);

  const addActiveFeedback = useCallback((message: string, type: 'info' | 'warning' | 'success', category?: string) => {
    const now = Date.now();
    
    if (category) {
      const lastTime = lastFeedbackTimeRef.current[category] || 0;
      const cooldownTime = category === 'posture' ? 15000 : 10000;
      if (now - lastTime < cooldownTime) {
        return;
      }
      lastFeedbackTimeRef.current[category] = now;
    }

    setActiveFeedback(prev => [...prev, { message, type, timestamp: now, category }].slice(-3));
  }, []);

  const [movementStates, setMovementStates] = useState<{ [key: string]: MovementState }>({});
  const movementStateRef = useRef<{ [key: string]: MovementState }>({});

  const analyzeMovement = useCallback((
    currentKeypoints: Keypoint[],
    previousKeypoints: Keypoint[] | null | undefined,
    frameTime: number
  ) => {
    const now = Date.now();
    const movements: { [key: string]: { velocity: number; confidence: number } } = {};
    const newMovementStates: { [key: string]: MovementState } = {};

    const getMovementName = (keypoint: string, velocity: number, direction: { x: number, y: number }) => {
      const isVertical = Math.abs(direction.y) > Math.abs(direction.x);
      const isUpward = direction.y < 0;
      const isRightward = direction.x > 0;
      
      switch (keypoint) {
        case 'left_wrist':
        case 'right_wrist':
          if (isVertical) {
            return `${keypoint.split('_')[0]} arm ${isUpward ? 'raising' : 'lowering'}`;
          } else {
            return `${keypoint.split('_')[0]} arm ${isRightward ? 'extending' : 'retracting'}`;
          }
        case 'left_ankle':
        case 'right_ankle':
          if (isVertical) {
            return `${keypoint.split('_')[0]} leg ${isUpward ? 'lifting' : 'lowering'}`;
          } else {
            return `${keypoint.split('_')[0]} leg ${isRightward ? 'forward' : 'backward'} movement`;
          }
        case 'left_knee':
        case 'right_knee':
          return `${keypoint.split('_')[0]} knee ${isVertical ? (isUpward ? 'lifting' : 'lowering') : 'bending'}`;
        case 'left_hip':
        case 'right_hip':
          return `${keypoint.split('_')[0]} hip rotation`;
        case 'left_shoulder':
        case 'right_shoulder':
          return `${keypoint.split('_')[0]} shoulder ${isVertical ? 'shrug' : 'rotation'}`;
        default:
          return `${keypoint} movement`;
      }
    };

    currentKeypoints.forEach(kp => {
      const prevKp = previousKeypoints?.find(p => p.name === kp.name);
      if (!prevKp) {
        movements[kp.name] = { velocity: 0, confidence: kp.score };
        newMovementStates[kp.name] = {
          velocity: 0,
          direction: { x: 0, y: 0 },
          confidence: kp.score,
          lastUpdate: now,
          smoothedVelocity: 0,
          smoothedDirection: { x: 0, y: 0 }
        };
        return;
      }

      const deltaX = kp.x - prevKp.x;
      const deltaY = kp.y - prevKp.y;
      const deltaTime = frameTime / 1000;
      
      const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / deltaTime;
      
      const prevState = movementStateRef.current[kp.name];
      
      const smoothedVelocity = prevState ? 
        prevState.velocity * 0.7 + velocity * 0.3 : 
        velocity;
      
      const direction = {
        x: deltaX / deltaTime,
        y: deltaY / deltaTime
      };
      
      const smoothedDirection = prevState ? {
        x: prevState.direction.x * 0.7 + direction.x * 0.3,
        y: prevState.direction.y * 0.7 + direction.y * 0.3
      } : direction;

      movements[kp.name] = {
        velocity: smoothedVelocity,
        confidence: kp.score
      };

      newMovementStates[kp.name] = {
        velocity: smoothedVelocity,
        direction: smoothedDirection,
        confidence: kp.score,
        lastUpdate: now,
        smoothedVelocity,
        smoothedDirection
      };

      if (smoothedVelocity > 3 && kp.score > 0.5) {
        const movementName = getMovementName(kp.name, smoothedVelocity, smoothedDirection);
        console.log(`Movement detected: ${movementName}`, {
          instantVelocity: velocity,
          smoothedVelocity,
          direction: smoothedDirection,
          confidence: kp.score,
          deltaTime,
          timeSinceLastUpdate: now - (prevState?.lastUpdate || now)
        });
      }
    });

    movementStateRef.current = newMovementStates;
    setMovementStates(newMovementStates);

    setMovementHistory(prev => {
      const newHistory = { ...prev };
      
      newHistory.timestamps = [now, ...prev.timestamps].slice(0, 30);
      
      Object.entries(movements).forEach(([name, data]) => {
        if (!newHistory.keypoints[name]) {
          newHistory.keypoints[name] = [];
        }
        
        const currentKp = currentKeypoints.find(kp => kp.name === name);
        if (!currentKp) return;

        const movementState = newMovementStates[name];
        newHistory.keypoints[name] = [
          { 
            x: currentKp.x,
            y: currentKp.y,
            confidence: data.confidence,
            velocity: movementState.velocity,
            direction: movementState.direction
          },
          ...newHistory.keypoints[name]
        ].slice(0, 30);
      });

      const confidences = Object.values(movements).map(m => m.confidence);
      const weightedConfidence = confidences.reduce((sum, conf, i) => 
        sum + conf * Math.pow(0.9, i), 0) / confidences.length;
      
      newHistory.confidenceHistory = [weightedConfidence, ...prev.confidenceHistory]
        .slice(0, 30);

      return newHistory;
    });

    return movements;
  }, []);

  const analyzePosture = useCallback((keypoints: Keypoint[]) => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const nose = keypoints.find(kp => kp.name === 'nose');
    const leftShoulder = keypoints.find(kp => kp.name === 'left_shoulder');
    const rightShoulder = keypoints.find(kp => kp.name === 'right_shoulder');
    const leftHip = keypoints.find(kp => kp.name === 'left_hip');
    const rightHip = keypoints.find(kp => kp.name === 'right_hip');
    const leftKnee = keypoints.find(kp => kp.name === 'left_knee');
    const rightKnee = keypoints.find(kp => kp.name === 'right_knee');
    const leftAnkle = keypoints.find(kp => kp.name === 'left_ankle');
    const rightAnkle = keypoints.find(kp => kp.name === 'right_ankle');

    if (!nose || !leftShoulder || !rightShoulder || !leftHip || !rightHip || 
        nose.score < 0.5 || leftShoulder.score < 0.5 || rightShoulder.score < 0.5 || 
        leftHip.score < 0.5 || rightHip.score < 0.5) return;

    const essentialParts = [nose, leftShoulder, rightShoulder, leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle].filter(part => part !== undefined) as Keypoint[];
    const visibleParts = essentialParts.filter(part => part.score > 0.5);
    
    if (visibleParts.length < essentialParts.length * 0.8) {
      addActiveFeedback("Please adjust your position - I need to see your full body clearly", "warning", "position");
      return;
    }

    const avgConfidence = visibleParts.reduce((sum, part) => sum + part.score, 0) / visibleParts.length;
    
    if (avgConfidence < 0.5) {
      addActiveFeedback("Try moving to a better lit area or adjusting your camera", "info", "lighting");
      return;
    }

    if (leftHip && rightHip && leftHip.score > 0.3 && rightHip.score > 0.3) {
      const hipWidth = Math.abs(leftHip.x - rightHip.x);
      const normalizedHipWidth = hipWidth / video.videoWidth;
      
      if (normalizedHipWidth < 0.15) {
        addActiveFeedback("Widen your stance for better balance", "info", "stance");
      }
    }

    if (leftShoulder.score > 0.5 && rightShoulder.score > 0.5 && leftHip.score > 0.5 && rightHip.score > 0.5) {
      const shoulderMidpoint = {
        x: (leftShoulder.x + rightShoulder.x) / 2,
        y: (leftShoulder.y + rightShoulder.y) / 2
      };
      const hipMidpoint = {
        x: (leftHip.x + rightHip.x) / 2,
        y: (leftHip.y + rightHip.y) / 2
      };
      
      const postureAngle = Math.abs(Math.atan2(
        shoulderMidpoint.y - hipMidpoint.y,
        shoulderMidpoint.x - hipMidpoint.x
      ) * (180 / Math.PI));

      if (postureAngle > 25) {
        addActiveFeedback("Keep your back straight", "warning", "posture");
      }
    }

    const leftWrist = keypoints.find(kp => kp.name === 'left_wrist');
    const rightWrist = keypoints.find(kp => kp.name === 'right_wrist');
    
    if (leftWrist && rightWrist && nose && 
        leftWrist.score > 0.3 && rightWrist.score > 0.3 && nose.score > 0.3) {
      const guardHeight = Math.min(leftWrist.y, rightWrist.y);
      const faceGuardDistance = Math.abs(guardHeight - nose.y) / video.videoHeight;
      
      if (faceGuardDistance > 0.2) {
        addActiveFeedback("Keep your guard up to protect your face", "warning", "guard");
      }
    }

    if (leftKnee && rightKnee && leftHip && rightHip &&
        leftKnee.score > 0.3 && rightKnee.score > 0.3) {
      const kneeWidth = Math.abs(leftKnee.x - rightKnee.x);
      const hipWidth = Math.abs(leftHip.x - rightHip.x);
      const kneeHipRatio = kneeWidth / hipWidth;
      
      if (kneeHipRatio < 0.7) {
        addActiveFeedback("Keep your knees aligned with your hips", "info", "kneeAlignment");
      }
    }
  }, [addActiveFeedback]);

  const drawSkeleton = useCallback((
    ctx: CanvasRenderingContext2D,
    keypoints: Keypoint[],
    minConfidence: number
  ) => {
    const connections = [
      ['left_shoulder', 'right_shoulder'],
      ['left_shoulder', 'left_elbow'],
      ['right_shoulder', 'right_elbow'],
      ['left_elbow', 'left_wrist'],
      ['right_elbow', 'right_wrist'],
      ['left_shoulder', 'left_hip'],
      ['right_shoulder', 'right_hip'],
      ['left_hip', 'right_hip'],
      ['left_hip', 'left_knee'],
      ['right_hip', 'right_knee'],
      ['left_knee', 'left_ankle'],
      ['right_knee', 'right_ankle'],
      ['nose', 'left_eye'],
      ['nose', 'right_eye'],
      ['left_eye', 'left_ear'],
      ['right_eye', 'right_ear']
    ];

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    connections.forEach(([startPoint, endPoint]) => {
      const start = keypoints.find(kp => kp.name === startPoint);
      const end = keypoints.find(kp => kp.name === endPoint);

      if (start && end && start.score > minConfidence && end.score > minConfidence) {
        const avgConfidence = (start.score + end.score) / 2;

        const baseWidth = 4;
        const lineWidth = baseWidth * avgConfidence;

        const hue = avgConfidence > 0.7 ? 120 : 
                   avgConfidence > 0.5 ? 60 : 
                   0;

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = `hsla(${hue}, 100%, 70%, 0.5)`;
        ctx.lineWidth = lineWidth + 8;
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${avgConfidence})`;
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        ctx.strokeStyle = `hsla(${hue}, 100%, 90%, ${avgConfidence * 0.5})`;
        ctx.lineWidth = lineWidth * 0.5;
        ctx.stroke();

        [start, end].forEach(point => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, lineWidth * 0.7, 0, 2 * Math.PI);
          ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${point.score})`;
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(point.x, point.y, lineWidth * 0.4, 0, 2 * Math.PI);
          ctx.fillStyle = `hsla(${hue}, 100%, 90%, ${point.score * 0.5})`;
          ctx.fill();
        });
      }
    });

    ctx.globalAlpha = 1;
  }, []);

  const drawKeypoints = useCallback((
    ctx: CanvasRenderingContext2D,
    keypoints: Keypoint[],
    minConfidence: number
  ) => {
    keypoints.forEach(keypoint => {
      if (keypoint.score < minConfidence) return;

      const radius = 6;
      const lineWidth = 2;

      ctx.beginPath();
      ctx.arc(keypoint.x, keypoint.y, radius + 4, 0, 2 * Math.PI);
      const alpha = Math.min(1, keypoint.score * 1.5);
      const hue = keypoint.score > 0.7 ? 120 : 
                 keypoint.score > 0.5 ? 60 : 
                 0;
      ctx.fillStyle = `hsla(${hue}, 100%, 70%, ${alpha * 0.3})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(keypoint.x, keypoint.y, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = `hsla(${hue}, 100%, 30%, ${alpha})`;
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(keypoint.x, keypoint.y, radius - lineWidth/2, 0, 2 * Math.PI);
      ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;
      ctx.fill();
      
      if (showDebugInfo) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.font = '12px Arial';
        const text = `${keypoint.name} (${(keypoint.score * 100).toFixed(0)}%)`;
        const textWidth = ctx.measureText(text).width;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(
          keypoint.x + radius + 5,
          keypoint.y - 8,
          textWidth + 6,
          16
        );
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText(
          text,
          keypoint.x + radius + 8,
          keypoint.y + 4
        );
      }
    });
  }, [showDebugInfo]);

  const STRIKE_COOLDOWN = 500;
  const JAB_VELOCITY_THRESHOLD = 150;
  const CROSS_VELOCITY_THRESHOLD = 200;
  const ROUNDHOUSE_VELOCITY_THRESHOLD = 250;
  const MIN_EXTENSION_ANGLE = 150;
  const MIN_HIP_ROTATION = 20;
  const MIN_GUARD_SCORE = 0.6;

  const detectStrike = useCallback((
    keypoints: Keypoint[], 
    previousKeypoints: Keypoint[] | null | undefined,
    frameTime: number
  ): StrikeData | null => {
    const now = Date.now();
    
    if (now - lastStrikeTimeRef.current < STRIKE_COOLDOWN) {
      return null;
    }

    const getKeypoint = (name: string, points: Keypoint[] | null | undefined = keypoints) => 
      points?.find(kp => kp.name === name);

    const keyPointsMap = {
      nose: keypoints.find(kp => kp.name === 'nose'),
      leftShoulder: keypoints.find(kp => kp.name === 'left_shoulder'),
      rightShoulder: keypoints.find(kp => kp.name === 'right_shoulder'),
      leftElbow: keypoints.find(kp => kp.name === 'left_elbow'),
      rightElbow: keypoints.find(kp => kp.name === 'right_elbow'),
      leftWrist: keypoints.find(kp => kp.name === 'left_wrist'),
      rightWrist: keypoints.find(kp => kp.name === 'right_wrist'),
      leftHip: keypoints.find(kp => kp.name === 'left_hip'),
      rightHip: keypoints.find(kp => kp.name === 'right_hip'),
      leftKnee: keypoints.find(kp => kp.name === 'left_knee'),
      rightKnee: keypoints.find(kp => kp.name === 'right_knee'),
      leftAnkle: keypoints.find(kp => kp.name === 'left_ankle'),
      rightAnkle: keypoints.find(kp => kp.name === 'right_ankle')
    };

    const coreKeypoints = [
      keyPointsMap.leftShoulder,
      keyPointsMap.rightShoulder,
      keyPointsMap.leftHip,
      keyPointsMap.rightHip
    ];

    const coreConfidence = coreKeypoints.every(kp => 
      kp && kp.score > 0.65);
    
    if (!coreConfidence) {
      return null;
    }

    const hipRotation = calculateAngle(
      keyPointsMap.leftHip!,
      keyPointsMap.rightHip!,
      keyPointsMap.rightShoulder!
    );
    
    const shoulderAlignment = calculateAngle(
      keyPointsMap.leftShoulder!,
      keyPointsMap.rightShoulder!,
      keyPointsMap.rightHip!
    );

    const guardScore = Math.min(
      keyPointsMap.leftWrist?.score || 0,
      keyPointsMap.rightWrist?.score || 0
    );

    if (keyPointsMap.leftWrist && keyPointsMap.leftElbow && keyPointsMap.leftShoulder &&
        keyPointsMap.leftWrist.score > 0.65 && keyPointsMap.leftElbow.score > 0.65) {
      
      const extensionAngle = calculateAngle(
        keyPointsMap.leftWrist,
        keyPointsMap.leftElbow,
        keyPointsMap.leftShoulder
      );

      const { velocity, direction, smoothedVelocity } = getMovementData(keyPointsMap.leftWrist);

      if (extensionAngle > MIN_EXTENSION_ANGLE && 
          smoothedVelocity > JAB_VELOCITY_THRESHOLD && 
          direction.x < -0.8 && 
          Math.abs(direction.y) < 0.3 && 
          keyPointsMap.leftWrist.y < keyPointsMap.leftShoulder.y && 
          guardScore > MIN_GUARD_SCORE) {
        
        lastStrikeTimeRef.current = now;
        console.log('Movement Detected: Jab');
        
        return {
          type: 'jab',
          side: 'left',
          speed: smoothedVelocity / 100,
          accuracy: keyPointsMap.leftWrist.score,
          power: (smoothedVelocity / 100) * (extensionAngle / 180),
          form: {
            hipRotation,
            shoulderAlignment,
            guardPosition: guardScore
          }
        };
      }
    }

    if (keyPointsMap.rightWrist && keyPointsMap.rightElbow && keyPointsMap.rightShoulder &&
        keyPointsMap.rightWrist.score > 0.65 && keyPointsMap.rightElbow.score > 0.65) {
      
      const extensionAngle = calculateAngle(
        keyPointsMap.rightWrist,
        keyPointsMap.rightElbow,
        keyPointsMap.rightShoulder
      );

      const { velocity, direction, smoothedVelocity } = getMovementData(keyPointsMap.rightWrist);
      const hipTwist = calculateAngle(
        keyPointsMap.leftHip!,
        keyPointsMap.rightHip!,
        keyPointsMap.rightShoulder
      );

      if (extensionAngle > MIN_EXTENSION_ANGLE && 
          smoothedVelocity > CROSS_VELOCITY_THRESHOLD && 
          direction.x > 0.8 && 
          Math.abs(direction.y) < 0.3 && 
          hipTwist > MIN_HIP_ROTATION && 
          keyPointsMap.rightWrist.y < keyPointsMap.rightShoulder.y && 
          guardScore > MIN_GUARD_SCORE) {
        
        lastStrikeTimeRef.current = now;
        console.log('Movement Detected: Cross');
        
        return {
          type: 'cross',
          side: 'right',
          speed: smoothedVelocity / 100,
          accuracy: keyPointsMap.rightWrist.score,
          power: (smoothedVelocity / 100) * (hipTwist / 90) * (extensionAngle / 180),
          form: {
            hipRotation,
            shoulderAlignment,
            guardPosition: guardScore
          }
        };
      }
    }

    const detectRoundhouse = (side: 'left' | 'right') => {
      const ankle = side === 'left' ? keyPointsMap.leftAnkle : keyPointsMap.rightAnkle;
      const knee = side === 'left' ? keyPointsMap.leftKnee : keyPointsMap.rightKnee;
      const hip = side === 'left' ? keyPointsMap.leftHip : keyPointsMap.rightHip;
      const oppositeHip = side === 'left' ? keyPointsMap.rightHip : keyPointsMap.leftHip;

      if (!ankle || !knee || !hip || !oppositeHip || 
          ankle.score < 0.5 || knee.score < 0.5 || hip.score < 0.5) {
        return null;
      }

      const kneeAngle = calculateAngle(ankle, knee, hip);
      const hipAngle = calculateAngle(knee, hip, oppositeHip);
      const { velocity, direction, smoothedVelocity } = getMovementData(ankle);

      if (ankle.y < hip.y && 
          kneeAngle < 140 && 
          hipAngle > 45 && 
          smoothedVelocity > ROUNDHOUSE_VELOCITY_THRESHOLD && 
          Math.abs(direction.x) > 0.8 && 
          guardScore > MIN_GUARD_SCORE) {
        
        lastStrikeTimeRef.current = now;
        console.log(`Movement Detected: Roundhouse (${side})`);
        
        const strikeData: StrikeData = {
          type: 'roundhouse' as StrikeType,
          side,
          speed: smoothedVelocity / 100,
          accuracy: Math.min(ankle.score, knee.score),
          power: (smoothedVelocity / 100) * (hipAngle / 90),
          form: {
            hipRotation,
            shoulderAlignment,
            guardPosition: guardScore,
            kneeAngle,
            hipAngle
          }
        };
        
        return strikeData;
      }
      return null;
    };

    const leftRoundhouse = detectRoundhouse('left');
    if (leftRoundhouse) return leftRoundhouse;

    const rightRoundhouse = detectRoundhouse('right');
    if (rightRoundhouse) return rightRoundhouse;

    return null;
  }, [calculateAngle, getMovementData]);

  const debouncedSetKeypoints = useCallback(
    debounce((newKeypoints: Keypoint[]) => {
      setKeypoints(newKeypoints);
    }, 16),
    []
  );

  const detectPose = async () => {
    const video = videoRef.current;
    if (!detector || !video || state.isVideoStopped || typeof video.readyState === 'undefined') return;

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
            const pose = poses[0];
            
            const filteredKeypoints = pose.keypoints.map((kp: Keypoint) => ({
              ...kp,
              score: ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'].includes(kp.name) 
                ? kp.score 
                : kp.score * 0.9
            }));

            console.log('Detected Keypoints:', filteredKeypoints);

            setKeypoints(filteredKeypoints);
            
            previousPoseRef.current = {
              keypoints: filteredKeypoints,
              score: pose.score
            };
            
            const movements = analyzeMovement(filteredKeypoints, previousPoseRef.current?.keypoints, frameTime);
          }
        }).catch(error => {
          console.error('Error estimating poses:', error);
        });
      });

      if (!state.isVideoStopped) {
        requestAnimationFrame(detectPose);
      }
    } catch (error) {
      console.error('Error in pose detection:', error);
      
      previousPoseRef.current = null;
      
      if (!state.isVideoStopped) {
        setTimeout(() => {
          requestAnimationFrame(detectPose);
        }, 1000);
      }
    }
  };

  useEffect(() => {
    if (detector) {
      detectPose();
    }
  }, [detector]);

  const cleanupFeedback = useCallback(() => {
    const now = Date.now();
    setActiveFeedback(prev => 
      prev.filter(feedback => now - feedback.timestamp < 3000)
    );
  }, []);

  useEffect(() => {
    const interval = setInterval(cleanupFeedback, 1000);
    return () => clearInterval(interval);
  }, [cleanupFeedback]);

  const ErrorMessage = useMemo(() => state.error ? (
    <div className="error-message" style={{
      backgroundColor: '#ff4444',
      color: 'white',
      padding: '1rem',
      marginBottom: '1rem',
      borderRadius: '4px'
    }}>
      {state.error}
    </div>
  ) : null, [state.error]);

  const FeedbackMessages = useMemo(() => (
    <div className="active-feedback">
      {activeFeedback.map((feedback, index) => (
        <div 
          key={feedback.timestamp} 
          className={`feedback-message ${feedback.type}`}
          style={{
            animation: `fadeInOut 3s forwards`,
            opacity: 1,
            transform: `translateY(${index * 40}px)`
          }}
        >
          {feedback.message}
        </div>
      ))}
    </div>
  ), [activeFeedback]);

  const DebugOverlay = useMemo(() => {
    if (!showDebugInfo) return null;

    return (
      <div className="debug-overlay" style={{
        position: 'absolute',
        top: 10,
        left: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        fontFamily: 'monospace',
        maxHeight: '80%',
        overflowY: 'auto',
        whiteSpace: 'pre-line'
      }}>
        <div>Keypoint Data:</div>
        {keypointData}
      </div>
    );
  }, [showDebugInfo, keypointData]);

  const initTF = async () => {
    try {
      tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);
      tf.env().set('WEBGL_FLUSH_THRESHOLD', 0);
      tf.env().set('WEBGL_FORCE_F16_TEXTURES', false);
      tf.env().set('WEBGL_VERSION', 1);
      tf.env().set('WEBGL_MAX_TEXTURE_SIZE', 1024);
      tf.env().set('CHECK_COMPUTATION_FOR_ERRORS', false);
      tf.env().set('WEBGL_CPU_FORWARD', true);
      tf.env().set('WEBGL_USE_SHAPES_UNIFORMS', true);
      tf.env().set('WEBGL_PACK_DEPTHWISECONV', false);

      try {
        await tf.ready();
        await tf.setBackend('webgl');
        
        const testTensor = tf.tensor2d([[1, 2], [3, 4]]);
        const testResult = testTensor.square();
        testResult.dispose();
        testTensor.dispose();
        
        console.log('WebGL backend initialized successfully');
        return;
      } catch (webglError) {
        console.warn('WebGL initialization failed:', webglError);
      }

      try {
        const wasmPath = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm/dist/';
        setWasmPaths(wasmPath);
        
        await tf.ready();
        await tf.setBackend('wasm');
        
        const testTensor = tf.tensor2d([[1, 2], [3, 4]]);
        const testResult = testTensor.square();
        testResult.dispose();
        testTensor.dispose();
        
        console.log('WASM backend initialized successfully');
        return;
      } catch (wasmError) {
        console.warn('WASM initialization failed:', wasmError);
      }

      try {
        await tf.ready();
        await tf.setBackend('cpu');
        console.log('CPU backend initialized successfully');
      } catch (cpuError) {
        const errorMsg = 'Failed to initialize any TensorFlow.js backend';
        console.error(errorMsg, cpuError);
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('TensorFlow initialization error:', error);
      setError(`Failed to initialize TensorFlow: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeTensorFlow = async () => {
      try {
        await tf.ready();
        const backend = tf.getBackend();
        console.log(`TensorFlow.js initialized with backend: ${backend}`);
      } catch (error) {
        console.error('Error initializing TensorFlow.js:', error);
        setError('Failed to initialize TensorFlow.js');
      }
    };

    initializeTensorFlow();

    return () => {
      isMounted = false;
      try {
        tf.disposeVariables();
        console.log('TensorFlow.js resources disposed');
      } catch (error) {
        console.warn('Error disposing TensorFlow.js resources:', error);
      }
    };
  }, []);

  useEffect(() => {
    const initializeDetector = async () => {
      try {
        await tf.ready();
        const model = poseDetection.SupportedModels.BlazePose;
        const detectorConfig: DetectorConfig = {
          runtime: 'tfjs',
          modelType: 'lite',
          enableSmoothing: true,
          solutionPath: 'path/to/solution'
        };
        const detector = await poseDetection.createDetector(model, detectorConfig);
        setDetector(detector as PoseDetector);
        console.log('Pose detector initialized');
      } catch (error) {
        console.error('Error initializing pose detector:', error);
        setError('Failed to initialize pose detector');
      }
    };

    initializeDetector();

    return () => {
      if (detector) {
        (detector as any)?.dispose?.();
        console.log('Pose detector disposed');
      }
    };
  }, []);

  useEffect(() => {
    const initializeSocket = () => {
      const socket = socketService.connect(process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000');
      
      if (!socket) {
        console.error('Failed to initialize socket connection');
        return;
      }

      const handleDisconnect = () => {
        console.log('Socket disconnected, attempting to reconnect...');
        reconnectTimeoutRef.current = setTimeout(() => {
          const newSocket = socketService.connect(process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000');
          if (newSocket) {
            console.log('Reconnection successful');
          } else {
            console.error('Reconnection failed');
          }
        }, 5000);
      };

      socket.on('disconnect', handleDisconnect);

      return () => {
        socket.off('disconnect', handleDisconnect);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        socketService.disconnect();
      };
    };

    initializeSocket();
  }, []);

  useEffect(() => {
    movementHistoryCleanupRef.current = setInterval(() => {
      setMovementHistory(prev => {
        const now = Date.now();
        const maxAge = 30000;
        return {
          ...prev,
          timestamps: prev.timestamps.filter(t => now - t < maxAge),
          keypoints: Object.fromEntries(
            Object.entries(prev.keypoints).map(([k, v]) => [
              k,
              v.slice(0, 30)
            ])
          )
        };
      });
    }, 5000);

    return () => {
      if (movementHistoryCleanupRef.current) {
        clearInterval(movementHistoryCleanupRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
          stream.removeTrack(track);
        });
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!currentExercise && exercises.length > 0) {
      setCurrentExercise(exercises[0].name);
      addActiveFeedback(exercises[0].instructions, 'info');
    }
  }, [currentExercise]);

  useEffect(() => {
    const startSession = async () => {
      try {
        const response: AxiosResponse<SessionResponse> = await axios.post('http://localhost:5000/api/score/session/start', {
          userId: 'default-user'
        });
        setSessionId(response.data.sessionId);
      } catch (error: unknown) {
        console.error('Failed to start session:', error instanceof Error ? error.message : 'Unknown error');
      }
    };
    startSession();

    return () => {
      if (sessionId) {
        axios.post(`http://localhost:5000/api/score/session/${sessionId}/end`)
          .catch((error: AxiosError) => console.error('Failed to end session:', error.message));
      }
    };
  }, []);

  useEffect(() => {
    const initializeCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480
          },
          audio: false
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
          };
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        setError('Failed to access camera. Please make sure you have granted camera permissions.');
      }
    };

    initializeCamera();
  }, []);

  const updateState = (updates: Partial<PoseDetectionState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const setKeypoints = (newKeypoints: Keypoint[]) => {
    updateState({ keypoints: newKeypoints });
  };

  const setError = (error: string | null) => {
    updateState({ error });
  };

  const setVideoStopped = (stopped: boolean) => {
    updateState({ isVideoStopped: stopped });
  };

  const toggleCoachMode = () => {
    setCoachMode(!coachMode);
  };

  const formatSessionTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const lastLogTimeRef = useRef<number | null>(null);

  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) return;

  const resizeCanvas = () => {
    if (videoRef.current && canvas) {
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.pointerEvents = 'none';
    }
  };

  const draw = (timestamp: number) => {
    if (!ctx || !videoRef.current) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawSkeleton(ctx, state.keypoints, 0.2);
    drawKeypoints(ctx, state.keypoints, 0.2);

    requestAnimationFrame(draw);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.pointerEvents = 'none';
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [state.keypoints]);

  return (
    <ErrorBoundary fallback={<div>Something went wrong in Pose Detection.</div>}>
      <div className="pose-detection">
        {state.error ? (
          <div className="error-message">
            <p>{state.error}</p>
            <button onClick={() => updateState({ error: null })}>Try Again</button>
          </div>
        ) : (
          <>
            <div className="video-section" style={{ position: 'relative' }}>
              <video
                ref={videoRef}
                style={{
                  transform: 'scaleX(-1)',
                  WebkitTransform: 'scaleX(-1)',
                  width: '100%',
                  height: '100%'
                }}
              />
              <canvas
                ref={canvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  transform: 'scaleX(-1)',
                  WebkitTransform: 'scaleX(-1)',
                  pointerEvents: 'none'
                }}
              />
              {activeFeedback.length > 0 && (
                <div className="feedback-section">
                  {activeFeedback.map((feedback, index) => (
                    <div key={feedback.timestamp} className={`feedback-message ${feedback.type}`}>
                      {feedback.message}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="stats-panel">
              <div className="current-move">
                <div className="stat-label">Current Move</div>
                <div className="stat-value">
                  {detectedStrike ? detectedStrike.type.replace('_', ' ').toUpperCase() : 'Ready'}
                </div>
              </div>

              <div className="stat-item">
                <div className="stat-label">Current Score</div>
                <div className="stat-value">
                  {techniqueAnalysis ? `${Math.round(techniqueAnalysis.score)}%` : '0%'}
                </div>
                <div className="accuracy-meter">
                  <div 
                    className="accuracy-fill" 
                    style={{ width: `${techniqueAnalysis ? techniqueAnalysis.score : 0}%` }}
                  />
                </div>
              </div>

              <div className="stat-item">
                <div className="stat-label">Accuracy</div>
                <div className="stat-value">
                  {detectedStrike ? `${Math.round(detectedStrike.accuracy * 100)}%` : '0%'}
                </div>
              </div>

              <div className="stat-item">
                <div className="stat-label">Strike Speed</div>
                <div className="stat-value">
                  {detectedStrike ? `${detectedStrike.speed.toFixed(1)} m/s` : '0 m/s'}
                </div>
              </div>

              <div className="stat-item">
                <div className="stat-label">Success Streak</div>
                <div className="stat-value">{successStreak}</div>
              </div>

              <div className="stat-item">
                <div className="stat-label">Completed Combos</div>
                <div className="stat-value">{completedCombos}</div>
              </div>

              <div className="session-timer">
                Session Time: {formatSessionTime(Date.now() - (sessionStats.startTime || Date.now()))}
              </div>
            </div>

            <div className="controls">
              <button onClick={toggleCoachMode}>
                {coachMode ? 'Disable' : 'Enable'} Coach Mode
              </button>
              <button onClick={() => setShowDebugInfo(!showDebugInfo)}>
                {showDebugInfo ? 'Hide' : 'Show'} Debug Info
              </button>
            </div>
          </>
        )}
        {showDebugInfo && <div className="debug-overlay">{keypointData}</div>}
      </div>
    </ErrorBoundary>
  );
};

export default PoseDetection; 