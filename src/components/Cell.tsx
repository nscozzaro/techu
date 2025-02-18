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
  isFaceDown?: boolean;
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

  // --- Use custom drag/drop hook ---
  const { onNativeDragStart, onNativeDragEnd, onNativeDragOver, onNativeDrop } = useCellDragDrop({
    onDragStart,
    onDragEnd,
    clearHighlights,
    isDisabled,
    index,
    card,
    playerId,
  });

  // --- Determine drop handler based on cell type ---
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
          ? (e) => onNativeDrop(e, handleDrop)
          : undefined
      }
      className={`cell ${isEmpty ? 'empty' : ''} ${
        isCellHighlighted ? 'highlight' : ''
      } ${isDisabled ? 'disabled' : ''}`}
    >
      {/* Deck rendering */}
      {isDeck && count !== undefined && renderDeck(count, playerId!)}

      {/* Hand rendering */}
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

      {/* Discard rendering */}
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

      {/* Board rendering */}
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
