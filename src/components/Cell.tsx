// src/components/Cell.tsx
import React from 'react';
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
  isCurrentPlayer?: boolean;
  isDisabled?: boolean; // **New Prop**
  isHighlighted?: boolean; // **New Prop**
  swapCardsInHand?: (playerId: PlayerEnum, sourceIndex: number, targetIndex: number) => void; // **New Prop**
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
  isCurrentPlayer = false,
  isDisabled = false, // **Default to false**
  isHighlighted = false, // **Default to false**
  swapCardsInHand, // **New Prop**
}) => {
  const isDeck = type === 'deck';
  const isHand = type === 'hand';
  const isDiscard = type === 'discard';
  const isBoard = type === 'board';

  const isEmpty = isHand ? !card : isDiscard ? (stack?.length === 0) : isBoard ? (stack?.length === 0) : false;
  const topCard = isHand ? card : isDiscard ? stack![stack!.length - 1] : isBoard ? stack![stack!.length - 1] : null;

  // **Determine if the cell should be highlighted**
  const isCellHighlighted = isHighlighted || (highlightedCells?.includes(index ?? -1) || false);

  let cardBackImage: string | undefined;
  if (topCard && topCard.faceDown) {
    cardBackImage = topCard.owner === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue;
  } else if (isHand && card && card.faceDown) {
    cardBackImage = card.owner === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue;
  }

  // **Drag Source Setup**
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
    canDrag: isHand && isCurrentPlayer && playerId !== undefined && !!handleCardDrag && !!card && !isDisabled, // **Prevent dragging if disabled**
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

  // **Drop Target Setup**
  const [{ canDrop, isOver }, dropRef] = useDrop<DropItem, void, { canDrop: boolean; isOver: boolean }>({
    accept: 'CARD',
    canDrop: (item: DropItem) => {
      if (isDisabled) return false; // **Disable dropping if disabled**
      if (type === 'discard') {
        // **Only allow dropping if the card belongs to the owner of the discard pile**
        return item.playerId === playerId;
      } else if (type === 'board' && playerTurn && isCellHighlighted) {
        return true;
      } else if (type === 'hand' && playerId === PlayerEnum.PLAYER1 && swapCardsInHand && isCurrentPlayer) {
        // **Allow dropping on hand slots for Player 1 to swap cards**
        return true;
      }
      return false;
    },
    drop: (item: DropItem, monitor: DropTargetMonitor) => {
      if (isDisabled) return; // **Do nothing if disabled**
      if (type === 'discard' && handleCardDiscard) {
        handleCardDiscard(item.cardIndex, item.playerId);
      } else if (type === 'board' && placeCardOnBoard && index !== undefined) {
        placeCardOnBoard(index, item.cardIndex);
      } else if (type === 'hand' && playerId === PlayerEnum.PLAYER1 && swapCardsInHand && index !== undefined) {
        // **Handle swapping cards within Player 1's hand**
        swapCardsInHand(PlayerEnum.PLAYER1, item.cardIndex, index);
      }
    },
    collect: (monitor) => ({
      canDrop: monitor.canDrop(),
      isOver: monitor.isOver(),
    }),
  });

  const isActive = canDrop && isOver;

  let cellRef: React.Ref<any> | null = null;
  if (isHand && playerId === PlayerEnum.PLAYER1 && swapCardsInHand) {
    // **Make Player 1's hand slots both drag sources and drop targets**
    cellRef = (node) => {
      dragRef(node);
      dropRef(node);
    };
  } else if (isHand) {
    // **Only drag for other players' hand slots**
    cellRef = dragRef;
  } else if (isDiscard || isBoard) {
    // **Only drop for discard and board cells**
    cellRef = dropRef;
  }

  return (
    <div
      ref={cellRef}
      className={`cell ${isEmpty ? 'empty' : ''} ${
        // **Apply 'highlight' only if the cell is 'board' or 'discard'**
        (isCellHighlighted || isActive) && (type === 'board' || type === 'discard') ? 'highlight' : ''
      } ${isDisabled ? 'disabled' : ''}`} // **Apply Highlight and Disabled Classes**
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
