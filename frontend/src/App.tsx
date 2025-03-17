import React, { useState } from 'react';
import './App.css';
import PoseDetection from './components/PoseDetection';
import Dashboard from './components/Dashboard';

function App() {
  const [currentView, setCurrentView] = useState<'training' | 'dashboard'>('training');

  return (
    <div className="App">
      <header className="App-header">
        <h1>Kyokushin Virtual Sensei</h1>
        <p>AI-Powered Martial Arts Training Assistant</p>
        <nav className="main-nav">
          <button 
            className={`nav-button ${currentView === 'training' ? 'active' : ''}`}
            onClick={() => setCurrentView('training')}
          >
            Training
          </button>
          <button 
            className={`nav-button ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
          >
            Dashboard
          </button>
        </nav>
      </header>
      <main>
        {currentView === 'training' ? <PoseDetection /> : <Dashboard />}
      </main>
      <footer>
        <p>© 2024 Kyokushin Virtual Sensei. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;
