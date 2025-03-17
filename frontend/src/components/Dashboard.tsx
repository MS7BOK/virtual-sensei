import React, { useEffect, useState } from 'react';
import axios from 'axios';

// Interface describing the structure of a training session
interface SessionHistory {
  _id: string;
  date: string;
  duration: number;
  totalStrikes: number;
  completedCombos: number;
  averageScore: number;
  maxComboStreak: number;
  techniqueBreakdown: Map<string, {
    count: number;
    averageScore: number;
    bestScore: number;
  }>;
}

// Dashboard component to display training session history
const Dashboard: React.FC = () => {
  const [sessionHistory, setSessionHistory] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch session history from the server
  useEffect(() => {
    const fetchSessionHistory = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/score/history/default-user');
        setSessionHistory(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load training history');
        setLoading(false);
      }
    };

    fetchSessionHistory();
  }, []);

  // Function to format duration from milliseconds to a readable string
  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  // Function to format a date string into a readable format
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="dashboard loading">
        <h2>Loading training history...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard error">
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h2>Training Dashboard</h2>
        <div className="summary-stats">
          <div className="stat-card">
            <h3>Total Sessions</h3>
            <p>{sessionHistory.length}</p>
          </div>
          <div className="stat-card">
            <h3>Total Strikes</h3>
            <p>{sessionHistory.reduce((sum, session) => sum + session.totalStrikes, 0)}</p>
          </div>
          <div className="stat-card">
            <h3>Average Score</h3>
            <p>
              {(sessionHistory.reduce((sum, session) => sum + session.averageScore, 0) / 
                (sessionHistory.length || 1)).toFixed(1)}%
            </p>
          </div>
          <div className="stat-card">
            <h3>Best Streak</h3>
            <p>{Math.max(...sessionHistory.map(session => session.maxComboStreak))}</p>
          </div>
        </div>
      </header>

      <section className="recent-sessions">
        <h3>Recent Training Sessions</h3>
        <div className="sessions-grid">
          {sessionHistory.map(session => (
            <div key={session._id} className="session-card">
              <div className="session-header">
                <h4>{formatDate(session.date)}</h4>
                <span className="duration">{formatDuration(session.duration)}</span>
              </div>
              <div className="session-stats">
                <div className="stat">
                  <label>Strikes:</label>
                  <span>{session.totalStrikes}</span>
                </div>
                <div className="stat">
                  <label>Combos:</label>
                  <span>{session.completedCombos}</span>
                </div>
                <div className="stat">
                  <label>Score:</label>
                  <span>{session.averageScore.toFixed(1)}%</span>
                </div>
                <div className="stat">
                  <label>Best Streak:</label>
                  <span>{session.maxComboStreak}</span>
                </div>
              </div>
              <div className="technique-breakdown">
                <h5>Technique Breakdown</h5>
                <div className="techniques-grid">
                  {Array.from(session.techniqueBreakdown.entries()).map(([technique, stats]) => (
                    <div key={technique} className="technique-stat">
                      <label>{technique}:</label>
                      <span>{stats.count} ({stats.averageScore.toFixed(1)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Dashboard; 