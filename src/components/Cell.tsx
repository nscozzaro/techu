// Cell.tsx

import React from 'react';
import { useDispatch } from 'react-redux';
import { Card, PlayerEnum } from '../types';
import cardBackRed from '../assets/card-back-red.png';
import cardBackBlue from '../assets/card-back-blue.png';
import { useCellDragDrop } from '../hooks/useCellDragDrop';
import { AppDispatch } from '../store';
import { placeCardOnBoard, discardCard } from '../features/game';

export type CellType = 'deck' | 'hand' | 'discard' | 'board';

interface CellProps {
  type: CellType;
  card?: Card | null;
  index?: number;
  playerId?: PlayerEnum;
  stack?: (Card | null)[];
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
  card: Card | null | undefined,
  stack?: (Card | null)[]
): Card | null => {
  if (type === 'hand') return card ?? null;
  if (stack && stack.length > 0) return stack[stack.length - 1] ?? null;
  return null;
};

/* ---------- Render Helpers (each < 10 lines) ---------- */
const renderDeckContent = (count: number | undefined, playerId: PlayerEnum | undefined) => {
  if (count !== undefined && playerId) return renderDeck(count, playerId);
  return null;
};

const renderHandContent = (card: Card | null | undefined) => {
  if (card) {
    return card.faceDown ? renderCardBack(card.owner) : renderCardContent(card);
  }
  return <div className="empty-placeholder" />;
};

const renderDiscardContent = (topCard: Card | null, isVisible: boolean | undefined) => {
  if (!isVisible) return null;
  if (topCard) {
    return topCard.faceDown ? renderCardBack(topCard.owner) : renderCardContent(topCard);
  }
  return <span>Discard</span>;
};

const renderBoardContent = (topCard: Card | null) => {
  if (topCard) {
    return topCard.faceDown ? renderCardBack(topCard.owner) : renderCardContent(topCard);
  }
  return null;
};

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
      ? card === null
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
      dispatch(discardCard({ cardIndex: dragData.cardIndex, playerId }));
    } else if (isBoard && index !== undefined) {
      dispatch(placeCardOnBoard({ index, cardIndex: dragData.cardIndex }));
    } else if (isHand && playerId === PlayerEnum.PLAYER1 && swapCardsInHand && index !== undefined) {
      swapCardsInHand(PlayerEnum.PLAYER1, dragData.cardIndex, index);
    }
  };

  const draggable = isHand && playerId === PlayerEnum.PLAYER1 && isCurrentPlayer && !isDisabled && !!card;

  const renderContent = () => {
    if (isDeck) return renderDeckContent(count, playerId);
    if (isHand) return renderHandContent(card);
    if (isDiscard) return renderDiscardContent(topCard, isVisible);
    if (isBoard) return renderBoardContent(topCard);
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
