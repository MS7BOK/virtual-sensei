// Interface describing a martial arts technique reference
interface TechniqueReference {
  type: string;
  side: 'left' | 'right';
  expectedParameters: {
    extensionAngle?: number;
    hipRotation?: number;
    shoulderAlignment?: number;
    guardPosition: number;
    kneeAngle?: number;
    hipAngle?: number;
    minimumSpeed: number;
  };
  formChecks: {
    name: string;
    check: (params: any) => boolean;
    feedback: string;
  }[];
}

// Record of different martial arts techniques with expected parameters and form checks
export const techniqueReferences: Record<string, TechniqueReference> = {
  jab: {
    type: 'jab',
    side: 'left',
    expectedParameters: {
      extensionAngle: 170, // Almost fully extended
      hipRotation: 0, // Minimal hip rotation for jab
      shoulderAlignment: 180, // Shoulders square
      guardPosition: 0.8, // Guard hand position confidence
      minimumSpeed: 5 // Minimum speed in m/s
    },
    formChecks: [
      {
        name: 'armExtension',
        check: (params) => params.extensionAngle >= 170,
        feedback: 'Extend your arm fully for a proper jab'
      },
      {
        name: 'shoulderAlignment',
        check: (params) => Math.abs(params.shoulderAlignment - 180) <= 15,
        feedback: 'Keep your shoulders square when jabbing'
      },
      {
        name: 'guardPosition',
        check: (params) => params.guardPosition >= 0.8,
        feedback: 'Maintain your guard hand position while jabbing'
      },
      {
        name: 'speed',
        check: (params) => params.speed >= 5,
        feedback: 'Increase your jab speed for better effectiveness'
      }
    ]
  },
  cross: {
    type: 'cross',
    side: 'right',
    expectedParameters: {
      extensionAngle: 170, // Almost fully extended
      hipRotation: 45, // Significant hip rotation
      shoulderAlignment: 135, // Shoulders rotated
      guardPosition: 0.8,
      minimumSpeed: 6
    },
    formChecks: [
      {
        name: 'armExtension',
        check: (params) => params.extensionAngle >= 170,
        feedback: 'Extend your arm fully for maximum reach'
      },
      {
        name: 'hipRotation',
        check: (params) => params.hipRotation >= 45,
        feedback: 'Rotate your hips more to generate power'
      },
      {
        name: 'shoulderAlignment',
        check: (params) => params.shoulderAlignment <= 150,
        feedback: 'Rotate your shoulders more with the cross'
      },
      {
        name: 'guardPosition',
        check: (params) => params.guardPosition >= 0.8,
        feedback: 'Keep your guard up while throwing the cross'
      },
      {
        name: 'speed',
        check: (params) => params.speed >= 6,
        feedback: 'Increase your cross speed for more power'
      }
    ]
  },
  roundhouse: {
    type: 'roundhouse',
    side: 'right',
    expectedParameters: {
      kneeAngle: 45, // Knee chambered
      hipAngle: 90, // Hip fully opened
      hipRotation: 90, // Full hip rotation
      shoulderAlignment: 135,
      guardPosition: 0.7,
      minimumSpeed: 7
    },
    formChecks: [
      {
        name: 'kneeChambering',
        check: (params) => params.kneeAngle <= 60,
        feedback: 'Chamber your knee more before kicking'
      },
      {
        name: 'hipOpening',
        check: (params) => params.hipAngle >= 80,
        feedback: 'Open your hip more for better kick height'
      },
      {
        name: 'hipRotation',
        check: (params) => params.hipRotation >= 80,
        feedback: 'Rotate your hips fully through the kick'
      },
      {
        name: 'guardPosition',
        check: (params) => params.guardPosition >= 0.7,
        feedback: 'Keep your guard up during the kick'
      },
      {
        name: 'speed',
        check: (params) => params.speed >= 7,
        feedback: 'Increase your kicking speed for more power'
      }
    ]
  }
}; 