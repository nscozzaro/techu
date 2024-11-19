// components/Deck.tsx
import React from 'react';
import { PlayerEnum } from '../types';

interface DeckProps {
  playerId: PlayerEnum;
  deckCount: number;
}

const Deck: React.FC<DeckProps> = ({ playerId, deckCount }) => {
  return (
    <div className="deck">
      <div className="deck-count">{deckCount}</div>
      <div className="card-back">
        {/* Optional: Add a design or image for the back of the deck */}
      </div>
    </div>
  );
};

export default Deck;
