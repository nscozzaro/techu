import React from 'react';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const StatsModal: React.FC<StatsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content stats-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>&times;</button>
        <h2>Statistics</h2>
        <div className="stats-section">
          <div className="stat">
            <div className="stat-number">30</div>
            <div className="stat-label">Games Played</div>
          </div>
          <div className="stat">
            <div className="stat-number">93%</div>
            <div className="stat-label">Win %</div>
          </div>
          <div className="stat">
            <div className="stat-number">10</div>
            <div className="stat-label">Current Streak</div>
          </div>
          <div className="stat">
            <div className="stat-number">15</div>
            <div className="stat-label">Max Streak</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsModal;