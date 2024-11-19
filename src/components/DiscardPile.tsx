// components/DiscardPile.tsx
import React from 'react';
import { useDrop } from 'react-dnd';
import { PlayerEnum, Card } from '../types';

interface DiscardPileProps {
  handleCardDiscard: (cardIndex: number, playerId: PlayerEnum) => void;
  playerId: PlayerEnum;
  stack: Card[];
}

const DiscardPile: React.FC<DiscardPileProps> = ({ handleCardDiscard, playerId, stack }) => {
  const [{ isOver, canDrop }, dropRef] = useDrop({
    accept: 'CARD',
    drop: (item: { cardIndex: number; playerId: PlayerEnum }) => {
      if (item.playerId === playerId) { // Ensure only own cards are discarded to own pile
        handleCardDiscard(item.cardIndex, item.playerId);
      }
    },
    canDrop: (item) => item.playerId === playerId, // Only allow own cards
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const topCard: Card | undefined = stack.length > 0 ? stack[stack.length - 1] : undefined;

  return (
    <div
      ref={dropRef}
      className={`discard-pile ${isOver && canDrop ? 'highlight' : ''}`}
    >
      {topCard ? (
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
      ) : (
        <span>Discard</span>
      )}
    </div>
  );
};

export default DiscardPile;
