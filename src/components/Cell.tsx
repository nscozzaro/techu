import React from 'react';
import { useDrag, useDrop, DragSourceMonitor } from 'react-dnd';
import { Card, PlayerEnum } from '../types';

interface DropItem {
  cardIndex: number;
  playerId: PlayerEnum;
}

type CellType = 'deck' | 'hand' | 'discard' | 'board';

interface CellProps {
  type: CellType;
  card?: Card; // For hand cells
  index?: number; // For hand cells and board cells
  playerId?: PlayerEnum;
  handleCardDrag?: (cardIndex: number, playerId: PlayerEnum) => void;
  stack?: Card[]; // For discard pile and board cells
  isVisible?: boolean; // For discard pile
  handleCardDiscard?: (cardIndex: number, playerId: PlayerEnum) => void;
  count?: number; // For deck
  isFaceDown?: boolean; // For deck
  highlightedCells?: number[];
  placeCardOnBoard?: (index: number, cardIndex: number) => void;
  playerTurn?: boolean; // For board cells
  clearHighlights?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const Cell: React.FC<CellProps> = ({
  type,
  card,
  index,
  playerId,
  handleCardDrag,
  stack,
  isVisible,
  handleCardDiscard,
  count,
  isFaceDown,
  highlightedCells,
  placeCardOnBoard,
  playerTurn,
  clearHighlights,
  onDragStart,
  onDragEnd,
}) => {
  const isDeck = type === 'deck';
  const isHand = type === 'hand';
  const isDiscard = type === 'discard';
  const isBoard = type === 'board';

  const isEmpty = isHand ? !card : isDiscard ? (stack?.length === 0) : isBoard ? (stack?.length === 0) : false;
  const topCard = isHand ? card : isDiscard ? stack![stack!.length - 1] : isBoard ? stack![stack!.length - 1] : null;

  const isHighlighted = highlightedCells?.includes(index ?? -1) || false;

  // useDrag Hook for hand cells
  const [{ isDragging }, dragRef] = useDrag<
    DropItem,
    void,
    { isDragging: boolean }
  >({
    type: 'CARD',
    item: () => {
      if (handleCardDrag && playerId !== undefined && index !== undefined && card) {
        handleCardDrag(index, playerId);
        if (onDragStart) {
          onDragStart();
        }
      }
      return { cardIndex: index!, playerId: playerId! };
    },
    canDrag: isHand && playerId !== undefined && !!handleCardDrag && !!card,
    collect: (monitor: DragSourceMonitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: () => {
      if (onDragEnd) {
        onDragEnd();
      }
      if (clearHighlights) {
        clearHighlights();
      }
    },
  });

  // useDrop Hook for discard and board cells
  const [{ canDrop, isOver }, dropRef] = useDrop<DropItem, void, { canDrop: boolean; isOver: boolean }>({
    accept: 'CARD',
    canDrop: () => {
      if (type === 'discard') {
        return true; // Allow dropping to discard pile
      } else if (type === 'board' && playerTurn && isHighlighted) {
        return true; // Allow dropping to board if it's player's turn and cell is highlighted
      }
      return false;
    },
    drop: (item: DropItem) => {
      if (type === 'discard' && handleCardDiscard) {
        handleCardDiscard(item.cardIndex, item.playerId);
      } else if (type === 'board' && placeCardOnBoard && index !== undefined) {
        placeCardOnBoard(index, item.cardIndex);
      }
    },
    collect: (monitor) => ({
      canDrop: monitor.canDrop(),
      isOver: monitor.isOver(),
    }),
  });

  const isActive = canDrop && isOver;

  // Determine refs
  let cellRef: React.Ref<any> | null = null;
  if (isHand) {
    cellRef = dragRef;
  } else if (isDiscard || isBoard) {
    cellRef = dropRef;
  }

  return (
    <div
      ref={cellRef}
      className={`cell ${isEmpty ? 'empty' : ''} ${
        isHighlighted || isActive ? 'highlight' : ''
      }`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      {/* Deck Cell */}
      {isDeck && count !== undefined && (
        <>
          {count > 0 ? (
            <div className="card-back">
              {/* Blue background for deck */}
              <div className="deck-count">{count}</div>
            </div>
          ) : (
            <div className="card-back empty-deck">
              <div className="deck-count">0</div>
            </div>
          )}
        </>
      )}

      {/* Hand Cell */}
      {isHand && (
        card ? (
          card.faceDown ? (
            <div className="card-back">
              {/* Design for the back of the card */}
            </div>
          ) : (
            <div className={`card-content ${card.color.toLowerCase()}`}>
              <div className="top-left">{card.rank}</div>
              <div className="suit">{card.suit}</div>
              <div className="bottom-right">{card.rank}</div>
            </div>
          )
        ) : (
          <div className="empty-placeholder">
            {/* Empty placeholder for hand slot */}
          </div>
        )
      )}

      {/* Discard Pile Cell */}
      {isDiscard && isVisible && (
        stack && stack.length > 0 ? (
          stack[stack.length - 1].faceDown ? (
            <div className="card-back">
              {/* Design for the back of the card */}
            </div>
          ) : (
            <div className={`card-content ${stack[stack.length - 1].color.toLowerCase()}`}>
              <div className="top-left">{stack[stack.length - 1].rank}</div>
              <div className="suit">{stack[stack.length - 1].suit}</div>
              <div className="bottom-right">{stack[stack.length - 1].rank}</div>
            </div>
          )
        ) : (
          <span>Discard</span>
        )
      )}

      {/* Board Cell */}
      {isBoard && (
        <>
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
        </>
      )}
    </div>
  );
};

export default Cell;
