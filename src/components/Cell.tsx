import React from 'react';
import { useDrop } from 'react-dnd';
import { Card } from '../types';

interface DropItem {
  cardIndex: number;
}

interface CellProps {
  stack: Card[]; // Updated to use the Card type from types.ts
  index: number;
  playerTurn: boolean;
  placeCardOnBoard: (index: number, cardIndex: number) => void;
  highlightedCells: number[];
}

const Cell: React.FC<CellProps> = ({
  stack,
  index,
  playerTurn,
  placeCardOnBoard,
  highlightedCells,
}) => {
  // DnD hook for managing drop functionality
  const [, drop] = useDrop({
    accept: 'CARD',
    canDrop: () => canDrop(),
    drop: (item: DropItem) => {
      if (playerTurn) {
        placeCardOnBoard(index, item.cardIndex);
      }
    },
  });

  // Check if the cell can receive a drop
  const canDrop = () => {
    if (!playerTurn) return false;
    return highlightedCells.includes(index);
  };

  // Determine if the cell should be highlighted
  const isHighlighted = highlightedCells.includes(index);

  // Display only the top card in the stack
  const topCard = stack[stack.length - 1];

  return (
    <div
      ref={drop}
      className={`cell ${isHighlighted ? 'highlight' : ''}`}
      data-index={index}
    >
      {topCard && (
        <div className={`card-played ${topCard.color.toLowerCase()}`}>
          <div className="top-left">{topCard.rank}</div>
          <div className="suit">{topCard.suit}</div>
          <div className="bottom-right">{topCard.rank}</div>
        </div>
      )}
    </div>
  );
};

export default Cell;
