import React from 'react';
import CardSlot from './CardSlot';

interface Card {
  suit: string;
  rank: string;
  color: 'red' | 'black';
}

interface HandProps {
  cards: (Card | null)[];
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
