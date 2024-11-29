// src/components/Cell.tsx

import React, { forwardRef } from 'react';
import { useDrag, useDrop, DragSourceMonitor, DropTargetMonitor } from 'react-dnd';
import { Card, PlayerEnum } from '../types';
import cardBackRed from '../assets/card-back-red.png';
import cardBackBlue from '../assets/card-back-blue.png';

interface DropItem {
  cardIndex: number;
  playerId: PlayerEnum;
}

type CellType = 'deck' | 'hand' | 'discard' | 'board';

interface CellProps {
  type: CellType;
  card?: Card;
  index?: number;
  playerId?: PlayerEnum;
  handleCardDrag?: (cardIndex: number, playerId: PlayerEnum) => void;
  stack?: (Card | undefined)[];
  isVisible?: boolean;
  handleCardDiscard?: (cardIndex: number, playerId: PlayerEnum) => void;
  count?: number;
  isFaceDown?: boolean;
  highlightedCells?: number[];
  placeCardOnBoard?: (index: number, cardIndex: number) => void;
  playerTurn?: boolean;
  clearHighlights?: () => void;
  onDragStart?: (playerId: PlayerEnum, cardIndex: number) => void;
  onDragEnd?: () => void;
  isCurrentPlayer?: boolean;
  isDisabled?: boolean;
  isHighlighted?: boolean;
  swapCardsInHand?: (playerId: PlayerEnum, sourceIndex: number, targetIndex: number) => void;
  children?: React.ReactNode; // For dealing card animation
}

const Cell = forwardRef<HTMLDivElement, CellProps>((props, ref) => {
  const {
    type,
    card,
    index,
    playerId,
    handleCardDrag,
    stack,
    isVisible = true,
    handleCardDiscard,
    count,
    highlightedCells = [],
    placeCardOnBoard,
    playerTurn = false,
    clearHighlights,
    onDragStart,
    onDragEnd,
    isCurrentPlayer = false,
    isDisabled = false,
    isHighlighted = false,
    swapCardsInHand,
    children,
  } = props;

  const isDeck = type === 'deck';
  const isHand = type === 'hand';
  const isDiscard = type === 'discard';
  const isBoard = type === 'board';

  const isEmpty = isHand
    ? !card
    : isDiscard
    ? !(stack && stack.length > 0)
    : isBoard
    ? !(stack && stack.length > 0)
    : false;

  const topCard = isHand
    ? card
    : isDiscard || isBoard
    ? stack && stack.length > 0
      ? stack[stack.length - 1]
      : null
    : null;

  const isCellHighlighted = isHighlighted || highlightedCells.includes(index ?? -1);

  const getCardBackImage = () => {
    if (topCard && topCard.faceDown) {
      return topCard.owner === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue;
    }
    if (isHand && card && card.faceDown) {
      return card.owner === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue;
    }
    return undefined;
  };

  const cardBackImage = getCardBackImage();

  // Drag Source Setup
  const [{ isDragging }, dragRef] = useDrag<
    DropItem,
    void,
    { isDragging: boolean }
  >({
    type: 'CARD',
    item: () => {
      if (handleCardDrag && playerId && index !== undefined && card) {
        handleCardDrag(index, playerId);
        onDragStart && onDragStart(playerId, index);
      }
      return { cardIndex: index!, playerId: playerId! };
    },
    canDrag:
      isHand &&
      isCurrentPlayer &&
      !!handleCardDrag &&
      !!card &&
      !isDisabled,
    collect: (monitor: DragSourceMonitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: () => {
      onDragEnd && onDragEnd();
      clearHighlights && clearHighlights();
    },
  });

  // Drop Target Setup
  const [{ canDrop, isOver }, dropRef] = useDrop<
    DropItem,
    void,
    { canDrop: boolean; isOver: boolean }
  >({
    accept: 'CARD',
    canDrop: (item: DropItem) => {
      if (isDisabled) return false;
      if (type === 'discard') {
        return item.playerId === playerId;
      }
      if (type === 'board') {
        return playerTurn && isCellHighlighted;
      }
      if (type === 'hand' && playerId === PlayerEnum.PLAYER1 && swapCardsInHand && isCurrentPlayer) {
        return true;
      }
      return false;
    },
    drop: (item: DropItem) => {
      if (isDisabled) return;
      if (type === 'discard' && handleCardDiscard) {
        handleCardDiscard(item.cardIndex, item.playerId);
      } else if (type === 'board' && placeCardOnBoard && index !== undefined) {
        placeCardOnBoard(index, item.cardIndex);
      } else if (type === 'hand' && playerId === PlayerEnum.PLAYER1 && swapCardsInHand && index !== undefined) {
        swapCardsInHand(PlayerEnum.PLAYER1, item.cardIndex, index);
      }
    },
    collect: (monitor: DropTargetMonitor) => ({
      canDrop: monitor.canDrop(),
      isOver: monitor.isOver(),
    }),
  });

  const isActive = canDrop && isOver;

  // Combine drag and drop refs based on cell type
  const setRef = (node: HTMLDivElement | null) => {
    if (isHand && playerId === PlayerEnum.PLAYER1 && swapCardsInHand) {
      dragRef(node);
      dropRef(node);
    } else if (isHand) {
      dragRef(node);
    } else if (isDiscard || isBoard || isDeck) {
      dropRef(node);
    }
    if (ref) {
      if (typeof ref === 'function') {
        ref(node);
      } else {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    }
  };

  const renderCard = () => {
    if (!topCard) return null;

    if (topCard.faceDown) {
      return (
        <div
          className="card-back"
          style={{
            backgroundImage: `url(${cardBackImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      );
    }

    return (
      <div className={`card-content ${topCard.color.toLowerCase()}`}>
        <div className="top-left">{topCard.rank}</div>
        <div className="suit">{topCard.suit}</div>
        <div className="bottom-right">{topCard.rank}</div>
      </div>
    );
  };

  return (
    <div
      ref={setRef}
      className={`cell ${isEmpty ? 'empty' : ''} ${
        (isCellHighlighted || isActive) && (type === 'board' || type === 'discard') ? 'highlight' : ''
      } ${isDisabled ? 'disabled' : ''}`}
      style={{ position: 'relative' }}
    >
      {isDeck && count !== undefined && (
        <div
          className={`card-back deck-back ${count === 0 ? 'empty-deck' : ''}`}
          style={{
            backgroundImage: count > 0
              ? `url(${playerId === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue})`
              : undefined,
            backgroundColor: count === 0
              ? playerId === PlayerEnum.PLAYER1 ? '#800000' : '#000080'
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="deck-count">{count}</div>
        </div>
      )}

      {isHand && !isDragging && card && renderCard()}

      {isDiscard && isVisible && (
        stack && stack.length > 0 ? renderCard() : <span>Discard</span>
      )}

      {isBoard && renderCard()}

      {/* Render children (e.g., dealing card animation) */}
      {children}
    </div>
  );
});

export default Cell;
