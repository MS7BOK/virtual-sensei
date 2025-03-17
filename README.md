# Kyokushin Virtual Sensei

A full-stack application that uses AI and computer vision to analyze martial arts movements and provide real-time feedback.

## Features

- Real-time motion tracking and analysis using TensorFlow.js and MediaPipe
- Live feedback on martial arts techniques
- Progress tracking and performance metrics
- WebSocket-based real-time updates
- User profiles and progress history

## Tech Stack

- Frontend:
  - React with TypeScript
  - TensorFlow.js
  - MediaPipe for pose estimation
  - WebSocket client for real-time updates
  
- Backend:
  - Node.js with Express
  - MongoDB for data persistence
  - Socket.io for real-time communication
  - TensorFlow.js for server-side processing

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- MongoDB installed and running
- npm or yarn package manager

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a .env file with the following variables:
   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/kyokushin-sensei
   ```

4. Start the server:
   ```bash
   npm start
   ```

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Allow camera access for motion tracking
3. Follow the on-screen instructions to begin training

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License. 