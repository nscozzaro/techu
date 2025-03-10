// src/components/Cell.tsx
import React from 'react';
import { useDispatch } from 'react-redux';
import { Card, PlayerEnum, CellIndex, CellIndices, CardCount, DestinationEnum } from '../types';
import cardBackRed from '../assets/card-back-red.png';
import cardBackBlue from '../assets/card-back-blue.png';
import { useCellDragDrop } from '../hooks/useCellDragDrop';
import { AppDispatch } from '../store';
import { moveCard } from '../features/game';

type CellType = 'deck' | 'hand' | 'discard' | 'board';

interface CellProps {
  type: CellType;
  card?: Card | null;
  index?: CellIndex;
  playerId?: PlayerEnum;
  stack?: (Card | null)[];
  isVisible?: boolean;
  count?: CardCount;
  highlightedCells?: CellIndices;
  playerTurn?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isCurrentPlayer?: boolean;
  isDisabled?: boolean;
  isHighlighted?: boolean;
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
      style={{
        backgroundImage: `url(${image})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        ...extraStyle,
      }}
    />
  );
};

const renderDeckContent = (
  count: number | undefined,
  playerId?: PlayerEnum
): JSX.Element | null => {
  if (count === undefined || !playerId) return null;
  return count > 0 ? (
    <div
      className="card-back deck-back"
      style={{
        backgroundImage: `url(${
          playerId === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue
        })`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="deck-count">{count}</div>
    </div>
  ) : (
    <div
      className="card-back empty-deck"
      style={{
        backgroundColor:
          playerId === PlayerEnum.PLAYER1 ? '#800000' : '#000080',
      }}
    >
      <div className="deck-count">0</div>
    </div>
  );
};

const renderHandContent = (card?: Card | null): JSX.Element =>
  card
    ? card.faceDown
      ? renderCardBack(card.owner)
      : renderCardContent(card)
    : <div className="empty-placeholder" />;

const renderDiscardContent = (
  stack?: (Card | null)[],
  isVisible?: boolean
): JSX.Element | null => {
  if (!isVisible) return null;
  const topCard = stack && stack.length ? stack[stack.length - 1] : null;
  return topCard
    ? topCard.faceDown
      ? renderCardBack(topCard.owner)
      : renderCardContent(topCard)
    : <span>Discard</span>;
};

const renderBoardContent = (stack?: (Card | null)[]): JSX.Element | null => {
  const topCard = stack && stack.length ? stack[stack.length - 1] : null;
  return topCard
    ? topCard.faceDown
      ? renderCardBack(topCard.owner)
      : renderCardContent(topCard)
    : null;
};

const renderCellContent = (props: CellProps): JSX.Element | null => {
  const { type, card, stack, count, playerId, isVisible } = props;
  switch (type) {
    case 'deck':
      return renderDeckContent(count, playerId);
    case 'hand':
      return renderHandContent(card);
    case 'discard':
      return renderDiscardContent(stack, isVisible);
    case 'board':
      return renderBoardContent(stack);
    default:
      return null;
  }
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
}) => {
  const dispatch = useDispatch<AppDispatch>();

  const isHand = type === 'hand';
  const isDiscard = type === 'discard';
  const isBoard = type === 'board';
  const isEmpty = isHand
    ? card === null
    : (isDiscard || isBoard)
    ? (stack?.length ?? 0) === 0
    : false;
  const shouldHighlight =
    (isBoard || isDiscard) && highlightedCells?.includes(index ?? -1);
  const cellHighlighted = isHighlighted || shouldHighlight;

  const { onNativeDragStart, onNativeDragEnd, onNativeDragOver, onNativeDrop } =
    useCellDragDrop({
      onDragStart,
      onDragEnd,
      isDisabled,
      index,
      card,
      playerId,
    });

  // Consolidated drop handler using a mapping object.
  const dropActions: { [key in 'discard' | 'board' | 'hand']: (dragData: { cardIndex: number; playerId: PlayerEnum }) => void } = {
    discard: (dragData) => {
      dispatch(
        moveCard({
          cardIndex: dragData.cardIndex,
          playerId: dragData.playerId,
          destination: DestinationEnum.DISCARD,
        })
      );
    },
    board: (dragData) => {
      if (index !== undefined) {
        dispatch(
          moveCard({
            cardIndex: dragData.cardIndex,
            playerId: dragData.playerId,
            destination: DestinationEnum.BOARD,
            boardIndex: index,
          })
        );
      }
    },
    hand: (dragData) => {
      if (index !== undefined) {
        dispatch(
          moveCard({
            cardIndex: dragData.cardIndex,
            playerId: dragData.playerId,
            destination: DestinationEnum.HAND,
            handIndex: index,
          })
        );
      }
    },
  };

  const handleDrop = (dragData: { cardIndex: number; playerId: PlayerEnum }) => {
    (dropActions[type as 'discard' | 'board' | 'hand'])(dragData);
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
      onDragOver={isDiscard || isBoard || isHand ? onNativeDragOver : undefined}
      onDrop={
        isDiscard || isBoard || isHand
          ? (e) => onNativeDrop(e, handleDrop)
          : undefined
      }
      className={`cell ${isEmpty ? 'empty' : ''} ${
        cellHighlighted ? 'highlight' : ''
      } ${isDisabled ? 'disabled' : ''}`}
    >
      {renderCellContent({ type, card, stack, count, playerId, isVisible })}
    </div>
  );
};

export default Cell;
