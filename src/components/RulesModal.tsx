// src/components/RulesModal.tsx

import React from 'react';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close">&times;</button>
        <h2>How to Play</h2>
        <p>
          The objective of Techu is to outscore your opponent by strategically
          placing cards on the board.
        </p>
        <ul>
          <li>Each turn, play one card from your hand onto the board.</li>
          <li>The rank and color of cards determine control over spaces.</li>
          <li>Score points by dominating the board.</li>
        </ul>
        <div className="example">
          <h3>Examples</h3>
          <div className="example-row">
            <span className="green">A</span>
            <span className="gray">K</span>
            <span className="gray">3</span>
            <span className="yellow">5</span>
          </div>
          <p>
            <strong>A:</strong> Indicates the Ace is played successfully and dominates the space.
          </p>
          <p>
            <strong>5:</strong> Highlights a move in a valid space.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RulesModal;
