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

interface PoseFeedback {
  accuracy: number;
  feedback: string;
  improvements: string[];
}

// Keep track of posture angles over time
const postureHistory: number[] = [];
const HISTORY_SIZE = 10; // Number of frames to keep track of
const POSTURE_THRESHOLD = 15; // Degrees
const CONSECUTIVE_FRAMES_THRESHOLD = 8; // Number of consecutive frames needed to trigger feedback

export async function analyzePose(poseData: PoseData): Promise<PoseFeedback> {
  const { keypoints, score } = poseData;
  const improvements: string[] = [];

  // Get required keypoints with confidence check
  const nose = keypoints.find(kp => kp.name === 'nose' && kp.score > 0.5);
  const leftShoulder = keypoints.find(kp => kp.name === 'left_shoulder' && kp.score > 0.5);
  const rightShoulder = keypoints.find(kp => kp.name === 'right_shoulder' && kp.score > 0.5);
  const leftHip = keypoints.find(kp => kp.name === 'left_hip' && kp.score > 0.5);
  const rightHip = keypoints.find(kp => kp.name === 'right_hip' && kp.score > 0.5);
  const leftKnee = keypoints.find(kp => kp.name === 'left_knee' && kp.score > 0.5);
  const rightKnee = keypoints.find(kp => kp.name === 'right_knee' && kp.score > 0.5);
  const leftAnkle = keypoints.find(kp => kp.name === 'left_ankle' && kp.score > 0.5);
  const rightAnkle = keypoints.find(kp => kp.name === 'right_ankle' && kp.score > 0.5);

  // Calculate posture angle
  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const shoulderMidpoint = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2
    };
    const hipMidpoint = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2
    };

    // Calculate angle between shoulder and hip midpoints
    const postureAngle = Math.abs(Math.atan2(
      shoulderMidpoint.y - hipMidpoint.y,
      shoulderMidpoint.x - hipMidpoint.x
    ) * (180 / Math.PI));

    // Add current angle to history
    postureHistory.push(postureAngle);
    if (postureHistory.length > HISTORY_SIZE) {
      postureHistory.shift();
    }

    // Check if posture has been consistently off
    const badPostureFrames = postureHistory.filter(angle => angle > POSTURE_THRESHOLD);
    if (badPostureFrames.length >= CONSECUTIVE_FRAMES_THRESHOLD) {
      improvements.push('Keep your back straight');
      // Clear history after giving feedback
      postureHistory.length = 0;
    }
  }

  // Check stance width with normalization
  if (leftAnkle && rightAnkle && leftHip && rightHip) {
    const hipWidth = Math.abs(leftHip.x - rightHip.x);
    const ankleWidth = Math.abs(leftAnkle.x - rightAnkle.x);
    const stanceRatio = ankleWidth / hipWidth;

    if (stanceRatio < 0.8) {
      improvements.push('Widen your stance for better stability');
    } else if (stanceRatio > 1.5) {
      improvements.push('Narrow your stance slightly for better mobility');
    }
  }

  // Check guard position with temporal consistency
  const leftWrist = keypoints.find(kp => kp.name === 'left_wrist' && kp.score > 0.5);
  const rightWrist = keypoints.find(kp => kp.name === 'right_wrist' && kp.score > 0.5);
  
  if (leftWrist && rightWrist && nose) {
    const guardHeight = Math.min(leftWrist.y, rightWrist.y);
    const guardDistance = Math.abs(guardHeight - nose.y) / Math.abs(nose.y - leftHip!.y);
    
    if (guardDistance > 0.3) {
      improvements.push('Keep your guard up to protect your face');
    }
  }

  // Calculate overall accuracy
  const visibleKeypoints = keypoints.filter(kp => kp.score > 0.5);
  const avgConfidence = visibleKeypoints.reduce((sum, kp) => sum + kp.score, 0) / visibleKeypoints.length;
  const accuracy = Math.max(0, Math.min(100, avgConfidence * 100 - (improvements.length * 5)));

  // Generate feedback message
  let feedback = '';
  if (accuracy >= 90) {
    feedback = 'Excellent form!';
  } else if (accuracy >= 70) {
    feedback = 'Good stance, keep it up!';
  } else if (accuracy >= 50) {
    feedback = 'Maintain your form and follow the feedback.';
  } else {
    feedback = 'Focus on the basics and follow the improvement suggestions.';
  }

  return {
    accuracy,
    feedback,
    improvements
  };
} 