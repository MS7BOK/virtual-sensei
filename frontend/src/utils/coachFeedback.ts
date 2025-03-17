interface CoachFeedback {
  message: string;
  intensity: 'mild' | 'moderate' | 'intense';
  type: 'correction' | 'motivation' | 'praise';
}

const coachPhrases = {
  correction: {
    mild: [
      "Your form needs work. {specific}",
      "Pay attention to your technique. {specific}",
      "Focus on the basics. {specific}"
    ],
    moderate: [
      "Is that what you call a {technique}? {specific}",
      "You're better than this! {specific}",
      "Back to basics - {specific}"
    ],
    intense: [
      "Unacceptable! {specific} A white belt knows better!",
      "Call that a {technique}? My grandmother hits harder! {specific}",
      "Wake up! {specific} This is Kyokushin, not dancing!"
    ]
  },
  motivation: {
    mild: [
      "You can do better than that.",
      "Focus your spirit!",
      "Channel your energy!"
    ],
    moderate: [
      "Show me your fighting spirit!",
      "Push through the pain!",
      "Stronger! Faster! Better!"
    ],
    intense: [
      "Pain is weakness leaving the body!",
      "Your opponent won't wait for you to get better!",
      "In a real fight, that weakness will cost you!"
    ]
  },
  praise: {
    mild: [
      "Better. Keep practicing.",
      "Good. Now do it again.",
      "That's more like it."
    ],
    moderate: [
      "Now that's Kyokushin spirit!",
      "Your training is paying off!",
      "Excellent power! Keep it up!"
    ],
    intense: [
      "OSU! That's how a karateka strikes!",
      "Now you're showing your true strength!",
      "That's the warrior spirit I want to see!"
    ]
  }
};

const intensityThresholds = {
  score: {
    intense: 90,
    moderate: 70,
    mild: 0
  },
  streak: {
    intense: 5,
    moderate: 3,
    mild: 0
  }
};

// Function to generate feedback based on score, technique type, and success streak
export function generateCoachFeedback(
  score: number,
  techniqueType: string,
  successStreak: number,
  specificFeedback: string
): CoachFeedback {
  // Determine intensity based on score and streak
  let intensity: 'mild' | 'moderate' | 'intense';
  if (score >= intensityThresholds.score.intense || successStreak >= intensityThresholds.streak.intense) {
    intensity = 'intense';
  } else if (score >= intensityThresholds.score.moderate || successStreak >= intensityThresholds.streak.moderate) {
    intensity = 'moderate';
  } else {
    intensity = 'mild';
  }

  // Determine feedback type
  let type: 'correction' | 'motivation' | 'praise';
  if (score >= 80) {
    type = 'praise';
  } else if (score >= 60) {
    type = 'motivation';
  } else {
    type = 'correction';
  }

  // Get random phrase from appropriate category
  const phrases = coachPhrases[type][intensity];
  const basePhrase = phrases[Math.floor(Math.random() * phrases.length)];

  // Replace placeholders in the message
  const message = basePhrase
    .replace('{specific}', specificFeedback)
    .replace('{technique}', techniqueType);

  return {
    message,
    intensity,
    type
  };
}

// Function to get motivational messages based on success streak
export function getMotivationalMessage(successStreak: number): string {
  if (successStreak === 0) {
    return "Show me what you're made of!";
  } else if (successStreak < 3) {
    return "Keep that momentum going!";
  } else if (successStreak < 5) {
    return "Now you're finding your rhythm!";
  } else {
    return "OSU! You're on fire!";
  }
}

// Function to provide feedback on completed combos
export function getComboFeedback(completedCombos: number): string {
  const phrases = [
    "Another combo down. Can you handle more?",
    "Good combination. Now with more power!",
    "Technique is nothing without spirit. Again!",
    "OSU! Your combinations are getting sharper!"
  ];
  return phrases[completedCombos % phrases.length];
} 