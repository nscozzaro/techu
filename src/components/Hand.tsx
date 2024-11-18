// Hand.tsx
import React from 'react';
import Cell from './Cell';
import { Hand as HandType, PlayerEnum } from '../types';

interface HandProps {
  cards: HandType;
  playerId: PlayerEnum;
  currentPlayerId: PlayerEnum;
  calculateValidMoves?: (index: number) => void;
  clearHighlights?: () => void;
}

const Hand: React.FC<HandProps> = ({
  cards,
  playerId,
  currentPlayerId,
  calculateValidMoves,
  clearHighlights,
}) => (
  <div className="hand">
    {cards.map((card, index) => (
      <Cell
        key={index}
        stack={card ? [card] : []}
        index={index}
        playerId={playerId}
        currentPlayerId={currentPlayerId}
        calculateValidMoves={calculateValidMoves}
        clearHighlights={clearHighlights}
      />
    ))}
  </div>
);

export default Hand;
