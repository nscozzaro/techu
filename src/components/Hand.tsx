// Hand.tsx
import React from 'react';
import Cell from './Cell';
import { Cards, PlayerEnum } from '../types';

interface HandProps {
  cards: Cards;
  playerId: PlayerEnum;
  currentPlayerId: PlayerEnum;
  handleCardDrag?: (index: number, playerId: PlayerEnum) => void;
  clearHighlights?: () => void;
  // Removed setIsDraggingCard as it's no longer needed
}

const Hand: React.FC<HandProps> = ({
  cards,
  playerId,
  currentPlayerId,
  handleCardDrag,
  clearHighlights,
}) => (
  <div className="hand">
    {cards.map((card, index) => (
      <Cell
        key={index}
        stack={[card]}
        index={index}
        playerId={playerId}
        currentPlayerId={currentPlayerId}
        handleCardDrag={handleCardDrag}
        clearHighlights={clearHighlights}
        // Removed setIsDraggingCard
      />
    ))}
  </div>
);

export default Hand;
