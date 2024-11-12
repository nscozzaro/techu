import React from 'react';
import { useDrop } from 'react-dnd';

function Cell({
  stack,
  index,
  playerTurn,
  placeCardOnBoard,
  highlightedCells,
}) {
  const [, drop] = useDrop({
    accept: 'CARD',
    canDrop: () => canDrop(),
    drop: (item) => {
      if (playerTurn) {
        placeCardOnBoard(index, item.cardIndex);
      }
    },
  });

  const canDrop = () => {
    if (!playerTurn) return false;
    return highlightedCells.includes(index);
  };

  const isHighlighted = highlightedCells.includes(index);
  const topCard = stack[stack.length - 1]; // Display only the top card

  return (
    <div
      ref={drop}
      className={`cell ${isHighlighted ? 'highlight' : ''}`}
      data-index={index}
    >
      {topCard && (
        <div className={`card-played ${topCard.color}`}>
          <div className="top-left">{topCard.rank}</div>
          <div className="suit">{topCard.suit}</div>
          <div className="bottom-right">{topCard.rank}</div>
        </div>
      )}
    </div>
  );
}

export default Cell;
