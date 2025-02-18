// src/components/Cell.tsx
import React from 'react';
import { Card, PlayerEnum } from '../types';
import cardBackRed from '../assets/card-back-red.png';
import cardBackBlue from '../assets/card-back-blue.png';

export type CellType = 'deck' | 'hand' | 'discard' | 'board';

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
  placeCardOnBoard?: (index: number, cardIndex: number, playerId: PlayerEnum) => void;
  playerTurn?: boolean;
  clearHighlights?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isCurrentPlayer?: boolean;
  isDisabled?: boolean;
  isHighlighted?: boolean;
  swapCardsInHand?: (playerId: PlayerEnum, sourceIndex: number, targetIndex: number) => void;
}

const Cell: React.FC<CellProps> = (props) => {
  const {
    type,
    card,
    index,
    playerId,
    handleCardDrag,
    stack,
    isVisible,
    handleCardDiscard,
    count,
    highlightedCells,
    placeCardOnBoard,
    onDragStart,
    onDragEnd,
    isCurrentPlayer = false,
    isDisabled = false,
    isHighlighted = false,
    swapCardsInHand,
    clearHighlights,
  } = props;

  const isDeck = type === 'deck';
  const isHand = type === 'hand';
  const isDiscard = type === 'discard';
  const isBoard = type === 'board';

  const isEmpty = isHand
    ? card === undefined
    : (isDiscard || isBoard)
    ? stack?.length === 0
    : false;

  const topCard: Card | null =
    isHand
      ? card ?? null
      : stack && stack.length > 0
      ? stack[stack.length - 1] ?? null
      : null;

  // --- Helper Functions ---
  const renderCardContent = (card: Card) => (
    <div className={`card-content ${card.color.toLowerCase()}`}>
      <div className="top-left">{card.rank}</div>
      <div className="suit">{card.suit}</div>
      <div className="bottom-right">{card.rank}</div>
    </div>
  );

  const renderCardBack = (owner: PlayerEnum, extraStyle?: React.CSSProperties) => {
    const image = owner === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue;
    return (
      <div
        className="card-back"
        style={{
          backgroundImage: `url(${image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          ...extraStyle,
        }}
      />
    );
  };

  const renderDeck = (count: number, owner: PlayerEnum) => {
    return count > 0 ? (
      <div
        className="card-back deck-back"
        style={{
          backgroundImage: `url(${owner === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="deck-count">{count}</div>
      </div>
    ) : (
      <div
        className="card-back empty-deck"
        style={{ backgroundColor: owner === PlayerEnum.PLAYER1 ? '#800000' : '#000080' }}
      >
        <div className="deck-count">0</div>
      </div>
    );
  };

  // --- Determine if cell should be highlighted ---
  const shouldHighlight =
    (type === 'board' || type === 'discard') &&
    highlightedCells?.includes(index ?? -1);
  const isCellHighlighted = isHighlighted || shouldHighlight;

  // --- Drag event handlers ---
  const onNativeDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (handleCardDrag && playerId !== undefined && index !== undefined && card) {
      handleCardDrag(index, playerId);
    }
    if (onDragStart) onDragStart();
    e.dataTransfer.setData('text/plain', JSON.stringify({ cardIndex: index, playerId }));
  };

  const onNativeDragEnd = () => {
    if (onDragEnd) onDragEnd();
    if (clearHighlights) clearHighlights();
  };

  const onNativeDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const onNativeDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      const { cardIndex, playerId: draggedPlayerId } = JSON.parse(
        e.dataTransfer.getData('text/plain')
      );
      if (isDisabled) return;

      if (isDiscard && handleCardDiscard) {
        handleCardDiscard(cardIndex, draggedPlayerId);
      } else if (isBoard && placeCardOnBoard && index !== undefined) {
        placeCardOnBoard(index, cardIndex, draggedPlayerId);
      } else if (isHand && playerId === PlayerEnum.PLAYER1 && swapCardsInHand && index !== undefined) {
        swapCardsInHand(PlayerEnum.PLAYER1, cardIndex, index);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (clearHighlights) clearHighlights();
    }
  };

  const draggable =
    isHand &&
    playerId === PlayerEnum.PLAYER1 &&
    isCurrentPlayer &&
    !isDisabled &&
    !!card;

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onNativeDragStart : undefined}
      onDragEnd={draggable ? onNativeDragEnd : undefined}
      onDragOver={
        (isDiscard || isBoard || (isHand && swapCardsInHand))
          ? onNativeDragOver
          : undefined
      }
      onDrop={
        (isDiscard || isBoard || (isHand && swapCardsInHand))
          ? onNativeDrop
          : undefined
      }
      className={`cell ${isEmpty ? 'empty' : ''} ${
        isCellHighlighted ? 'highlight' : ''
      } ${isDisabled ? 'disabled' : ''}`}
    >
      {/* Deck Rendering */}
      {isDeck && count !== undefined && renderDeck(count, playerId!)}

      {/* Hand Rendering */}
      {isHand &&
        (card ? (
          card.faceDown ? (
            renderCardBack(card.owner)
          ) : (
            renderCardContent(card)
          )
        ) : (
          <div className="empty-placeholder"></div>
        ))}

      {/* Discard Rendering */}
      {isDiscard && isVisible && (
        topCard ? (
          topCard.faceDown ? (
            renderCardBack(topCard.owner)
          ) : (
            renderCardContent(topCard)
          )
        ) : (
          <span>Discard</span>
        )
      )}

      {/* Board Rendering */}
      {isBoard && topCard && (
        topCard.faceDown ? (
          renderCardBack(topCard.owner)
        ) : (
          renderCardContent(topCard)
        )
      )}
    </div>
  );
};

export default Cell;
