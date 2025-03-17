import { StrikeData } from '../types/strikes';

interface StrikeFeedback {
  score: number;
  power: number;
  speed: number;
  accuracy: number;
  formScore: number;
  feedback: string;
  improvements: string[];
}

export async function analyzeStrike(strike: StrikeData): Promise<StrikeFeedback> {
  const improvements: string[] = [];
  let formScore = 100;

  // Analyze hip rotation
  if (strike.form.hipRotation < 30) {
    improvements.push('Rotate your hips more for better power generation');
    formScore -= 15;
  }

  // Analyze shoulder alignment
  if (strike.form.shoulderAlignment < 160) {
    improvements.push('Keep your shoulders aligned during the strike');
    formScore -= 10;
  }

  // Analyze guard position
  if (strike.form.guardPosition < 0.7) {
    improvements.push('Maintain your guard while striking');
    formScore -= 15;
  }

  // For kicks, check additional form elements
  if (strike.type.includes('kick')) {
    if (strike.form.kneeAngle && strike.form.kneeAngle < 45) {
      improvements.push('Chamber your knee more before kicking');
      formScore -= 10;
    }
    if (strike.form.hipAngle && strike.form.hipAngle < 60) {
      improvements.push('Open your hip more for better kick height');
      formScore -= 10;
    }
  }

  // Normalize scores
  const normalizedSpeed = Math.min(strike.speed / 10, 1) * 100; // Assuming max speed is 10 m/s
  const normalizedPower = strike.power * 100;
  const normalizedAccuracy = strike.accuracy * 100;

  // Calculate overall score
  const score = Math.round(
    (normalizedSpeed * 0.3) +  // 30% weight for speed
    (normalizedPower * 0.4) +  // 40% weight for power
    (formScore * 0.3)         // 30% weight for form
  );

  // Generate feedback message
  let feedback = '';
  if (score >= 90) {
    feedback = 'Excellent technique! Perfect balance of speed, power, and form.';
  } else if (score >= 80) {
    feedback = 'Very good strike! Minor adjustments needed for perfection.';
  } else if (score >= 70) {
    feedback = 'Good strike with room for improvement.';
  } else if (score >= 60) {
    feedback = 'Decent technique, but needs work on fundamentals.';
  } else {
    feedback = 'Focus on proper form before increasing speed and power.';
  }

  return {
    score,
    power: normalizedPower,
    speed: normalizedSpeed,
    accuracy: normalizedAccuracy,
    formScore,
    feedback,
    improvements
  };
} 