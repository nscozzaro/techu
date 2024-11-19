// DiscardPile.tsx
import React from 'react';
import { useDrop } from 'react-dnd';
import { PlayerEnum } from '../types';

interface DiscardPileProps {
  handleCardDiscard: (cardIndex: number, playerId: PlayerEnum) => void;
}

const DiscardPile: React.FC<DiscardPileProps> = ({ handleCardDiscard }) => {
  const [{ isOver, canDrop }, dropRef] = useDrop({
    accept: 'CARD',
    drop: (item: { cardIndex: number; playerId: PlayerEnum }) => {
      handleCardDiscard(item.cardIndex, item.playerId);
    },
    canDrop: () => true,
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  return (
    <div
      ref={dropRef}
      className={`discard-pile ${isOver && canDrop ? 'highlight' : ''}`}
      style={{
        width: '80px',
        height: '120px',
        border: '2px dashed gray',
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: isOver && canDrop ? '#f0f0f0' : 'transparent',
        cursor: 'pointer',
      }}
    >
      {/* You can add an icon or text to represent the discard pile */}
      <span>Discard</span>
    </div>
  );
};

export default DiscardPile;
