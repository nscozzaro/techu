// Cell.tsx
import React from 'react';
import { useDrag, useDrop, DragSourceMonitor, DropTargetMonitor } from 'react-dnd';
import { Card } from '../types';

interface DropItem {
  cardIndex: number;
}

interface CellProps {
  stack: Card[];
  index: number;
  isBot?: boolean;
  playerTurn: boolean;
  calculateValidMoves?: (index: number) => void;
  clearHighlights?: () => void;
  placeCardOnBoard?: (index: number, cardIndex: number) => void;
  highlightedCells?: number[];
}

const Cell: React.FC<CellProps> = ({
  stack,
  index,
  isBot,
  playerTurn,
  calculateValidMoves,
  clearHighlights,
  placeCardOnBoard,
  highlightedCells,
}) => {
  const topCard = stack[stack.length - 1];
  const isEmpty = stack.length === 0;
  const isHighlighted = highlightedCells?.includes(index);

  const isBoardCell = !!placeCardOnBoard;
  const isHandCell = !isBoardCell;

  // useDrag Hook for hand cells
  const [{ isDragging }, dragRef] = useDrag<
    { cardIndex: number }, // DragObject
    void,                  // DropResult
    { isDragging: boolean } // CollectedProps
  >({
    type: 'CARD',
    item: () => {
      if (calculateValidMoves) calculateValidMoves(index);
      return { cardIndex: index };
    },
    canDrag: isHandCell && !isBot && !!topCard && playerTurn && !!calculateValidMoves,
    collect: (monitor: DragSourceMonitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: () => {
      if (clearHighlights) clearHighlights();
    },
  });

  // useDrop Hook for board cells
  const [, dropRef] = useDrop<
    DropItem,
    void,
    unknown
  >({
    accept: 'CARD',
    canDrop: (item: DropItem, monitor: DropTargetMonitor) => {
      return playerTurn && isBoardCell && !!isHighlighted;
    },
    drop: (item: DropItem) => {
      if (placeCardOnBoard) {
        placeCardOnBoard(index, item.cardIndex);
      }
    },
  });

  // Determine refs
  const cellRef = isBoardCell ? dropRef : (!isBot && topCard ? dragRef : null);

  return (
    <div
      ref={cellRef}
      className={`cell ${isEmpty ? 'empty' : ''} ${isHighlighted ? 'highlight' : ''}`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
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
