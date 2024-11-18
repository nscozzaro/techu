// Cell.tsx
import React from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Card } from '../types';

interface DropItem {
  cardIndex: number;
}

interface CellProps {
  stack?: Card[];         // For board cells
  card?: Card | null;     // For hand cells
  index: number;
  isBot?: boolean;
  playerTurn: boolean;
  calculateValidMoves?: (index: number) => void;
  clearHighlights?: () => void;
  placeCardOnBoard?: (index: number, cardIndex: number) => void;
  highlightedCells?: number[];
}

const Cell: React.FC<CellProps> = (props) => {
  const {
    stack,
    card,
    index,
    isBot,
    playerTurn,
    calculateValidMoves,
    clearHighlights,
    placeCardOnBoard,
    highlightedCells,
  } = props;

  const topCard = stack ? stack[stack.length - 1] : card;
  const isEmpty = !topCard;
  const isHighlighted = highlightedCells && highlightedCells.includes(index);

  // useDrag Hook for hand cells
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: 'CARD',
      item: (): DropItem => {
        if (!isBot && card && playerTurn && calculateValidMoves) {
          calculateValidMoves(index);
        }
        return { cardIndex: index };
      },
      canDrag: !isBot && !!card && playerTurn && !!calculateValidMoves,
      collect: (monitor) => ({
        isDragging: !!monitor.isDragging(),
      }),
      end: () => {
        if (clearHighlights) {
          clearHighlights();
        }
      },
    }),
    [card, isBot, playerTurn, index, calculateValidMoves, clearHighlights]
  );

  // useDrop Hook for board cells
  const [, drop] = useDrop({
    accept: 'CARD',
    canDrop: () => playerTurn && !!highlightedCells && highlightedCells.includes(index),
    drop: (item: DropItem) => {
      if (playerTurn && placeCardOnBoard) {
        placeCardOnBoard(index, item.cardIndex);
      }
    },
  });

  // Determine refs
  const cellRef = stack ? drop : card && !isBot ? drag : null;

  return (
    <div
      ref={cellRef}
      className={`cell ${isEmpty ? 'empty' : ''} ${isHighlighted ? 'highlight' : ''}`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      data-index={index}
    >
      {topCard && (
        <div className={`card-content ${topCard.color.toLowerCase()}`}>
          <div className="top-left">{topCard.rank}</div>
          <div className="suit">{topCard.suit}</div>
          <div className="bottom-right">{topCard.rank}</div>
        </div>
      )}
    </div>
  );
};

export default Cell;
