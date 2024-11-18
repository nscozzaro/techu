// Hand.tsx
import React from 'react';
import Cell from './Cell';
import { Hand as HandType } from '../types';

interface HandProps {
  cards: HandType;
  isBot: boolean;
  playerTurn: boolean;
  calculateValidMoves: (index: number) => void;
  clearHighlights: () => void;
}

const Hand: React.FC<HandProps> = ({
  cards,
  isBot,
  playerTurn,
  calculateValidMoves,
  clearHighlights,
}) => (
  <div className="hand">
    {cards.map((card, index) => (
      <Cell
        key={index}
        stack={card ? [card] : []}
        index={index}
        isBot={isBot}
        playerTurn={playerTurn}
        calculateValidMoves={calculateValidMoves}
        clearHighlights={clearHighlights}
      />
    ))}
  </div>
);

export default Hand;
