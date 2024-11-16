import React from 'react';
import CardSlot from './CardSlot';
import { Hand as HandType } from '../types';

interface HandProps {
  cards: HandType; // Updated to use the Hand type from types.ts
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
}) => {
  return (
    <div className="hand">
      {cards.map((card, index) => (
        <CardSlot
          key={index}
          card={card}
          index={index}
          isBot={isBot}
          playerTurn={playerTurn}
          calculateValidMoves={calculateValidMoves}
          clearHighlights={clearHighlights}
        />
      ))}
    </div>
  );
};

export default Hand;
