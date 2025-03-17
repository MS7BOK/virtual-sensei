import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PoseDetection from '../components/PoseDetection';
import socketService from '../services/socketService';
import * as tf from '@tensorflow/tfjs';

// Mock dependencies
jest.mock('@tensorflow/tfjs');
jest.mock('@tensorflow-models/pose-detection');
jest.mock('../services/socketService');
jest.mock('axios');

describe('PoseDetection Component', () => {
  const mockPose = {
    keypoints: [
      { name: 'nose', x: 100, y: 100, score: 0.9 },
      { name: 'left_shoulder', x: 80, y: 120, score: 0.8 },
      { name: 'right_shoulder', x: 120, y: 120, score: 0.8 },
      { name: 'left_elbow', x: 60, y: 150, score: 0.8 },
      { name: 'right_elbow', x: 140, y: 150, score: 0.8 },
      { name: 'left_wrist', x: 40, y: 180, score: 0.8 },
      { name: 'right_wrist', x: 160, y: 180, score: 0.8 },
      { name: 'left_hip', x: 90, y: 200, score: 0.8 },
      { name: 'right_hip', x: 110, y: 200, score: 0.8 },
    ],
    score: 0.85
  };

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Mock getUserMedia
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: jest.fn().mockResolvedValue({
          getTracks: () => [{
            stop: jest.fn()
          }]
        }),
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: 'videoinput', deviceId: 'mock-camera' }
        ])
      }
    });

    // Mock canvas context
    HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn()
    });

    // Mock TensorFlow
    (tf.setBackend as jest.Mock).mockResolvedValue(undefined);
    (tf.ready as jest.Mock).mockResolvedValue(undefined);
  });

  test('renders without crashing', () => {
    render(<PoseDetection />);
    expect(screen.getByRole('button', { name: /enable coach mode/i })).toBeInTheDocument();
  });

  test('initializes TensorFlow and pose detector', async () => {
    render(<PoseDetection />);
    await waitFor(() => {
      expect(tf.setBackend).toHaveBeenCalledWith('webgl');
      expect(tf.ready).toHaveBeenCalled();
    });
  });

  test('connects to WebSocket server on mount', async () => {
    render(<PoseDetection />);
    await waitFor(() => {
      expect(socketService.connect).toHaveBeenCalled();
    });
  });

  test('toggles coach mode when button is clicked', () => {
    render(<PoseDetection />);
    const button = screen.getByRole('button', { name: /enable coach mode/i });
    fireEvent.click(button);
    expect(button).toHaveTextContent(/disable coach mode/i);
  });

  test('detects jab correctly', () => {
    const { container } = render(<PoseDetection />);
    const instance = container.firstChild as any;
    
    const mockKeypoints = [
      { name: 'left_wrist', x: 100, y: 80, score: 0.9 },
      { name: 'left_elbow', x: 80, y: 100, score: 0.9 },
      { name: 'left_shoulder', x: 60, y: 100, score: 0.9 },
      { name: 'right_wrist', x: 40, y: 100, score: 0.9 }
    ];

    const result = instance.detectStrike(mockKeypoints, null, 100);
    expect(result?.type).toBe('jab');
    expect(result?.side).toBe('left');
  });

  test('detects cross correctly', () => {
    const { container } = render(<PoseDetection />);
    const instance = container.firstChild as any;
    
    const mockKeypoints = [
      { name: 'right_wrist', x: 140, y: 80, score: 0.9 },
      { name: 'right_elbow', x: 120, y: 100, score: 0.9 },
      { name: 'right_shoulder', x: 100, y: 100, score: 0.9 },
      { name: 'left_wrist', x: 60, y: 100, score: 0.9 },
      { name: 'left_hip', x: 80, y: 150, score: 0.9 },
      { name: 'right_hip', x: 120, y: 150, score: 0.9 }
    ];

    const result = instance.detectStrike(mockKeypoints, null, 100);
    expect(result?.type).toBe('cross');
    expect(result?.side).toBe('right');
  });

  test('calculates angles correctly', () => {
    const { container } = render(<PoseDetection />);
    const instance = container.firstChild as any;
    
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 1, y: 0 };
    const p3 = { x: 1, y: 1 };
    
    const angle = instance.calculateAngle(p1, p2, p3);
    expect(angle).toBeCloseTo(90, 1);
  });

  test('calculates speed correctly', () => {
    const { container } = render(<PoseDetection />);
    const instance = container.firstChild as any;
    
    const current = { x: 100, y: 100 };
    const previous = { x: 0, y: 0 };
    const frameTime = 1000; // 1 second
    
    const speed = instance.calculateSpeed(current, previous, frameTime);
    expect(speed).toBeGreaterThan(0);
  });

  test('handles WebSocket feedback correctly', async () => {
    render(<PoseDetection />);
    
    const mockFeedback = {
      accuracy: 0.8,
      feedback: 'Good form!',
      improvements: ['Keep your guard up']
    };

    // Simulate receiving feedback
    await waitFor(() => {
      socketService.onPoseFeedback.mock.calls[0][0](mockFeedback);
    });

    expect(screen.getByText('Keep your guard up')).toBeInTheDocument();
  });

  test('handles errors gracefully', async () => {
    // Mock TensorFlow to throw an error
    (tf.setBackend as jest.Mock).mockRejectedValue(new Error('TensorFlow error'));
    
    render(<PoseDetection />);
    
    await waitFor(() => {
      expect(screen.getByText(/failed to initialize tensorflow backend/i)).toBeInTheDocument();
    });
  });
}); 