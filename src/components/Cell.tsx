// src/components/Cell.tsx
import React from 'react';
import { useDispatch } from 'react-redux';
import { Card, PlayerEnum } from '../types';
import cardBackRed from '../assets/card-back-red.png';
import cardBackBlue from '../assets/card-back-blue.png';
import { useCellDragDrop } from '../hooks/useCellDragDrop';
import { AppDispatch } from '../store';
import { placeCardOnBoardThunk, discardCardThunk } from '../features/gameThunks';

export type CellType = 'deck' | 'hand' | 'discard' | 'board';

interface CellProps {
  type: CellType;
  card?: Card;
  index?: number;
  playerId?: PlayerEnum;
  stack?: (Card | undefined)[];
  isVisible?: boolean;
  count?: number;
  highlightedCells?: number[];
  playerTurn?: boolean;
  clearHighlights?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isCurrentPlayer?: boolean;
  isDisabled?: boolean;
  isHighlighted?: boolean;
  swapCardsInHand?: (playerId: PlayerEnum, sourceIndex: number, targetIndex: number) => void;
}

// --- Render Helpers ---
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
      style={{ backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: 'center', ...extraStyle }}
    />
  );
};

const renderDeck = (count: number, owner: PlayerEnum) =>
  count > 0 ? (
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
    <div className="card-back empty-deck" style={{ backgroundColor: owner === PlayerEnum.PLAYER1 ? '#800000' : '#000080' }}>
      <div className="deck-count">0</div>
    </div>
  );

const getTopCard = (
  type: CellType,
  card: Card | undefined,
  stack?: (Card | undefined)[]
): Card | null =>
  type === 'hand'
    ? card ?? null
    : stack && stack.length > 0
    ? stack[stack.length - 1] ?? null
    : null;

const Cell: React.FC<CellProps> = ({
  type,
  card,
  index,
  playerId,
  stack,
  isVisible,
  count,
  highlightedCells,
  onDragStart,
  onDragEnd,
  isCurrentPlayer = false,
  isDisabled = false,
  isHighlighted = false,
  swapCardsInHand,
  clearHighlights,
}) => {
  const dispatch = useDispatch<AppDispatch>();

  const isDeck = type === 'deck';
  const isHand = type === 'hand';
  const isDiscard = type === 'discard';
  const isBoard = type === 'board';
  const isEmpty =
    isHand
      ? card === undefined
      : (isDiscard || isBoard)
      ? (stack?.length ?? 0) === 0
      : false;
  const topCard = getTopCard(type, card, stack);

  const shouldHighlight =
    (isBoard || isDiscard) && highlightedCells?.includes(index ?? -1);
  const cellHighlighted = isHighlighted || shouldHighlight;

  const { onNativeDragStart, onNativeDragEnd, onNativeDragOver, onNativeDrop } =
    useCellDragDrop({
      onDragStart,
      onDragEnd,
      clearHighlights,
      isDisabled,
      index,
      card,
      playerId,
    });

  const handleDrop = (dragData: { cardIndex: number; playerId: PlayerEnum }) => {
    if (isDiscard && playerId) {
      dispatch(discardCardThunk({ cardIndex: dragData.cardIndex, playerId }));
    } else if (isBoard && index !== undefined) {
      dispatch(placeCardOnBoardThunk({ index, cardIndex: dragData.cardIndex }));
    } else if (isHand && playerId === PlayerEnum.PLAYER1 && swapCardsInHand && index !== undefined) {
      swapCardsInHand(PlayerEnum.PLAYER1, dragData.cardIndex, index);
    }
  };

  const draggable =
    isHand && playerId === PlayerEnum.PLAYER1 && isCurrentPlayer && !isDisabled && !!card;

  const renderContent = () => {
    if (isDeck && count !== undefined && playerId)
      return renderDeck(count, playerId);
    if (isHand)
      return card
        ? card.faceDown
          ? renderCardBack(card.owner)
          : renderCardContent(card)
        : <div className="empty-placeholder" />;
    if (isDiscard && isVisible)
      return topCard
        ? topCard.faceDown
          ? renderCardBack(topCard.owner)
          : renderCardContent(topCard)
        : <span>Discard</span>;
    if (isBoard && topCard)
      return topCard.faceDown ? renderCardBack(topCard.owner) : renderCardContent(topCard);
    return null;
  };

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onNativeDragStart : undefined}
      onDragEnd={draggable ? onNativeDragEnd : undefined}
      onDragOver={(isDiscard || isBoard || (isHand && swapCardsInHand))
        ? onNativeDragOver
        : undefined}
      onDrop={(isDiscard || isBoard || (isHand && swapCardsInHand))
        ? (e) => onNativeDrop(e, handleDrop)
        : undefined}
      className={`cell ${isEmpty ? 'empty' : ''} ${cellHighlighted ? 'highlight' : ''} ${isDisabled ? 'disabled' : ''}`}
    >
      {renderContent()}
    </div>
  );
};

export default Cell;
