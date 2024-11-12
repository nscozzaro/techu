import React from 'react';
import CardSlot from './CardSlot';

function Hand({ cards, isBot, playerTurn, calculateValidMoves, clearHighlights }) {
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
}

export default Hand;
