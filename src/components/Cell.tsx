// src/components/Cell.tsx
import React, { forwardRef } from 'react';
import { Card, PlayerEnum } from '../types';
import cardBackRed from '../assets/card-back-red.png';
import cardBackBlue from '../assets/card-back-blue.png';

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

  // Ensure 'index' is defined before using it
  const isCellHighlighted = index !== undefined && (isHighlighted || highlightedCells.includes(index));

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

  // DragOver Handler: Only allow drop if the cell is highlighted
  const handleDragOverNative = (e: React.DragEvent<HTMLDivElement>) => {
    if (isDisabled) return;

    if (isCellHighlighted) {
      e.preventDefault(); // Allow drop
      e.dataTransfer.dropEffect = 'move';
    } else {
      // Indicate that the drop is not allowed
      e.dataTransfer.dropEffect = 'none';
    }
  };

  // Drop Handler: Only handle the drop if it's valid
  const handleDropNative = (e: React.DragEvent<HTMLDivElement>) => {
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;

    try {
      const parsedData = JSON.parse(data);
      const { cardIndex, playerId: draggedPlayerId } = parsedData;

      // Determine if the drop is valid based on cell type and game rules
      if (type === 'discard' && handleCardDiscard) {
        if (draggedPlayerId === playerId) {
          e.preventDefault(); // Valid drop
          handleCardDiscard(cardIndex, draggedPlayerId);
          return;
        }
      } else if (type === 'board') {
        if (placeCardOnBoard && playerTurn && isCellHighlighted) {
          e.preventDefault(); // Valid drop
          placeCardOnBoard(index!, cardIndex);
          return;
        }
      } else if (type === 'hand' && playerId === PlayerEnum.PLAYER1 && swapCardsInHand && isCurrentPlayer) {
        e.preventDefault(); // Valid drop
        swapCardsInHand(PlayerEnum.PLAYER1, cardIndex, index!);
        return;
      }

      // If the drop is invalid, do not preventDefault(), allowing snap-back
    } catch (error) {
      console.error('Error parsing drag data:', error);
    }

    // Clear highlights and end drag regardless of drop validity
    if (clearHighlights) {
      clearHighlights();
    }

    if (onDragEnd) {
      onDragEnd();
    }
  };

  // DragStart Handler: Set up the drag data
  const handleDragStartNative = (e: React.DragEvent<HTMLDivElement>) => {
    if (isHand && isCurrentPlayer && handleCardDrag && card && !isDisabled) {
      e.dataTransfer.setData('application/json', JSON.stringify({
        cardIndex: index,
        playerId: playerId,
      }));
      e.dataTransfer.effectAllowed = 'move';
      if (onDragStart && playerId !== undefined) { // Ensure playerId is defined
        onDragStart(playerId, index!);
      }
    }
  };

  // Render the card based on its state
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
            opacity: 1, // Ensure opacity is consistent
          }}
        />
      );
    }

    return (
      <div
        className={`card-content ${topCard.color.toLowerCase()}`}
      >
        <div className="top-left">{topCard.rank}</div>
        <div className="suit">{topCard.suit}</div>
        <div className="bottom-right">{topCard.rank}</div>
      </div>
    );
  };

  return (
    <div
      ref={ref}
      className={`cell ${isEmpty ? 'empty' : ''} ${
        isCellHighlighted && (type === 'board' || type === 'discard') ? 'highlight' : ''
      } ${isDisabled ? 'disabled' : ''}`}
      style={{ position: 'relative' }}
      draggable={isHand && isCurrentPlayer && handleCardDrag && card && !isDisabled}
      onDragStart={handleDragStartNative}
      onDragOver={handleDragOverNative}
      onDrop={handleDropNative}
    >
      {/* Deck Cell */}
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

      {/* Hand Cell */}
      {isHand && !isEmpty && card && renderCard()}

      {/* Discard Pile Cell */}
      {isDiscard && isVisible && (
        stack && stack.length > 0 ? renderCard() : <span>Discard</span>
      )}

      {/* Board Cell */}
      {isBoard && renderCard()}

      {/* Render children (e.g., dealing card animation) */}
      {children}
    </div>
  );
});

export default Cell;
