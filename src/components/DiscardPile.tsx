// DiscardPile.tsx
import React from 'react';
import { useDrop } from 'react-dnd';
import { PlayerEnum } from '../types';

interface DiscardPileProps {
  handleCardDiscard: (cardIndex: number, playerId: PlayerEnum) => void;
}

const DiscardPile: React.FC<DiscardPileProps> = ({ handleCardDiscard }) => {
  const [{ isOver }, dropRef] = useDrop({
    accept: 'CARD',
    drop: (item: { cardIndex: number; playerId: PlayerEnum }) => {
      handleCardDiscard(item.cardIndex, item.playerId);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  return (
    <div
      ref={dropRef}
      className="discard-pile"
      style={{
        border: '2px dashed gray',
        width: '80px',
        height: '120px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: isOver ? '#f0f0f0' : 'transparent',
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        zIndex: 1000,
      }}
    >
      Discard
    </div>
  );
};

export default DiscardPile;
