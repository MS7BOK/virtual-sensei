import { techniqueReferences } from './techniqueReference';
import { StrikeData } from '../types/strikes';

interface TechniqueAnalysis {
  isCorrect: boolean;
  score: number;
  improvements: string[];
  overallFeedback: string;
}

// Function to analyze a given strike against reference techniques
export function analyzeTechnique(strike: StrikeData): TechniqueAnalysis {
  const reference = techniqueReferences[strike.type];
  if (!reference || reference.side !== strike.side) {
    return {
      isCorrect: false,
      score: 0,
      improvements: ['Unrecognized technique or incorrect side'],
      overallFeedback: 'Please practice the basic techniques as demonstrated'
    };
  }

  const improvements: string[] = [];
  let totalChecks = reference.formChecks.length;
  let passedChecks = 0;

  // Check each aspect of the technique
  reference.formChecks.forEach(check => {
    const params = {
      extensionAngle: strike.form.shoulderAlignment,
      hipRotation: strike.form.hipRotation,
      shoulderAlignment: strike.form.shoulderAlignment,
      guardPosition: strike.form.guardPosition,
      speed: strike.speed,
      power: strike.power,
      kneeAngle: strike.type.includes('kick') ? strike.form.kneeAngle : undefined,
      hipAngle: strike.type.includes('kick') ? strike.form.hipAngle : undefined
    };

    if (!check.check(params)) {
      improvements.push(check.feedback);
    } else {
      passedChecks++;
    }
  });

  const score = (passedChecks / totalChecks) * 100;
  let overallFeedback = '';

  if (score >= 90) {
    overallFeedback = 'Excellent form! Keep practicing to maintain this level.';
  } else if (score >= 70) {
    overallFeedback = 'Good technique, but there\'s room for improvement.';
  } else if (score >= 50) {
    overallFeedback = 'Basic form achieved. Focus on the suggested improvements.';
  } else {
    overallFeedback = 'Review the basic technique. Pay attention to the fundamentals.';
  }

  return {
    isCorrect: score >= 70,
    score,
    improvements,
    overallFeedback
  };
}

// Function to provide feedback on the speed of a technique
export function getSpeedFeedback(speed: number, techniqueType: string): string {
  const reference = techniqueReferences[techniqueType];
  if (!reference) return '';

  const minSpeed = reference.expectedParameters.minimumSpeed;
  if (speed >= minSpeed * 1.2) {
    return 'Excellent speed!';
  } else if (speed >= minSpeed) {
    return 'Good speed, maintain this pace.';
  } else if (speed >= minSpeed * 0.8) {
    return 'Increase your speed slightly.';
  } else {
    return 'Focus on generating more speed.';
  }
}

// Function to offer feedback on the power of a technique
export function getPowerFeedback(power: number): string {
  if (power >= 0.9) {
    return 'Powerful technique!';
  } else if (power >= 0.7) {
    return 'Good power generation.';
  } else if (power >= 0.5) {
    return 'Focus on hip rotation and body mechanics for more power.';
  } else {
    return 'Work on proper form to generate more power.';
  }
} 