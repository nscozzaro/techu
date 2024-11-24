// src/components/Cell.tsx

import React from 'react';
import { useDrag, useDrop, DragSourceMonitor } from 'react-dnd';
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
  stack?: Card[];
  isVisible?: boolean;
  handleCardDiscard?: (cardIndex: number, playerId: PlayerEnum) => void;
  count?: number;
  isFaceDown?: boolean;
  highlightedCells?: number[];
  placeCardOnBoard?: (index: number, cardIndex: number) => void;
  playerTurn?: boolean;
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

  let cardBackImage: string | undefined;
  if (topCard && topCard.faceDown) {
    cardBackImage = topCard.owner === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue;
  } else if (isHand && card && card.faceDown) {
    cardBackImage = card.owner === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue;
  }

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

  const [{ canDrop, isOver }, dropRef] = useDrop<DropItem, void, { canDrop: boolean; isOver: boolean }>({
    accept: 'CARD',
    canDrop: () => {
      if (type === 'discard') {
        return true;
      } else if (type === 'board' && playerTurn && isHighlighted) {
        return true;
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
      {isDeck && count !== undefined && (
        <>
          {count > 0 ? (
            <div
              className="card-back deck-back"
              style={{
                backgroundImage: `url(${playerId === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }} // Updated to use playerId for deck back image
            >
              <div className="deck-count">{count}</div>
            </div>
          ) : (
            <div
              className="card-back empty-deck"
              style={{
                backgroundColor: playerId === PlayerEnum.PLAYER1 ? '#800000' : '#000080', // Optional: Differentiate empty decks
              }}
            >
              <div className="deck-count">0</div>
            </div>
          )}
        </>
      )}

      {isHand && (
        card ? (
          card.faceDown ? (
            <div
              className="card-back"
              style={{
                backgroundImage: `url(${cardBackImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          ) : (
            <div className={`card-content ${card.color.toLowerCase()}`}>
              <div className="top-left">{card.rank}</div>
              <div className="suit">{card.suit}</div>
              <div className="bottom-right">{card.rank}</div>
            </div>
          )
        ) : (
          <div className="empty-placeholder"></div>
        )
      )}

      {isDiscard && isVisible && (
        stack && stack.length > 0 ? (
          stack[stack.length - 1].faceDown ? (
            <div
              className="card-back"
              style={{
                backgroundImage: `url(${stack[stack.length - 1].owner === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
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

      {isBoard && (
        <>
          {topCard && (
            topCard.faceDown ? (
              <div
                className="card-back"
                style={{
                  backgroundImage: `url(${topCard.owner === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
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
