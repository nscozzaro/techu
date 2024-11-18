// Cell.tsx
import React from 'react';
import { useDrag, useDrop, DragSourceMonitor } from 'react-dnd';
import { Card, PlayerEnum } from '../types';

interface DropItem {
  cardIndex: number;
  playerId: PlayerEnum;
}

interface CellProps {
  stack: Card[];
  index: number;
  playerId?: PlayerEnum;
  currentPlayerId?: PlayerEnum;
  playerTurn?: boolean;
  handleCardDrag?: (cardIndex: number, playerId: PlayerEnum) => void;
  clearHighlights?: () => void;
  placeCardOnBoard?: (index: number, cardIndex: number) => void;
  highlightedCells?: number[];
  setIsDraggingCard?: React.Dispatch<React.SetStateAction<boolean>>;
}

const Cell: React.FC<CellProps> = ({
  stack,
  index,
  playerId,
  currentPlayerId,
  playerTurn,
  handleCardDrag,
  clearHighlights,
  placeCardOnBoard,
  highlightedCells,
  setIsDraggingCard,
}) => {
  const topCard = stack[stack.length - 1];
  const isEmpty = stack.length === 0;
  const isHighlighted = highlightedCells?.includes(index) || false;

  const isBoardCell = !!placeCardOnBoard;
  const isHandCell = !isBoardCell;

  // useDrag Hook for hand cells
  const [{ isDragging }, dragRef] = useDrag<
    DropItem,
    void,
    { isDragging: boolean }
  >({
    type: 'CARD',
    item: () => {
      if (handleCardDrag && playerId !== undefined)
        handleCardDrag(index, playerId);
      if (setIsDraggingCard) setIsDraggingCard(true);
      return { cardIndex: index, playerId: playerId! };
    },
    canDrag:
      isHandCell && playerId === currentPlayerId && !!handleCardDrag,
    collect: (monitor: DragSourceMonitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: () => {
      if (clearHighlights) clearHighlights();
      if (setIsDraggingCard) setIsDraggingCard(false);
    },
  });

  // useDrop Hook for board cells
  const [, dropRef] = useDrop<DropItem, void, unknown>({
    accept: 'CARD',
    canDrop: () => {
      return Boolean(playerTurn && isBoardCell && isHighlighted);
    },
    drop: (item: DropItem) => {
      if (placeCardOnBoard) {
        placeCardOnBoard(index, item.cardIndex);
      }
    },
  });

  // Determine refs
  const cellRef = isBoardCell
    ? dropRef
    : playerId === currentPlayerId
    ? dragRef
    : null;

  return (
    <div
      ref={cellRef}
      className={`cell ${isEmpty ? 'empty' : ''} ${
        isHighlighted ? 'highlight' : ''
      }`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      {topCard && (
        topCard.faceDown ? (
          <div className="card-back">
            {/* Design for the back of the card */}
          </div>
        ) : (
          <div className={`card-content ${topCard.color.toLowerCase()}`}>
            <div className="top-left">{topCard.rank}</div>
            <div className="suit">{topCard.suit}</div>
            <div className="bottom-right">{topCard.rank}</div>
          </div>
        )
      )}
    </div>
  );
};

export default Cell;
