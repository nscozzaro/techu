import React from 'react';
import { useDrag } from 'react-dnd';

interface Card {
  suit: string;
  rank: string;
  color: 'red' | 'black';
}

interface CardSlotProps {
  card: Card | null;
  index: number;
  isBot: boolean;
  playerTurn: boolean;
  calculateValidMoves: (index: number) => void;
  clearHighlights: () => void;
}

interface DragItem {
  cardIndex: number;
}

const CardSlot: React.FC<CardSlotProps> = ({
  card,
  index,
  isBot,
  playerTurn,
  calculateValidMoves,
  clearHighlights,
}) => {
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: 'CARD',
      item: (): DragItem => {
        if (!isBot && card && playerTurn) {
          calculateValidMoves(index); // Calculate valid moves on drag start
        }
        return { cardIndex: index };
      },
      canDrag: !isBot && !!card && playerTurn,
      collect: (monitor) => ({
        isDragging: !!monitor.isDragging(),
      }),
      end: () => {
        clearHighlights(); // Clear highlights on drag end
      },
    }),
    [card, isBot, playerTurn, index, calculateValidMoves, clearHighlights]
  );

  return (
    <div
      ref={!isBot && card ? drag : null}
      className={`card-slot ${card ? card.color : ''}`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      {card ? (
        <>
          <div className="top-left">{card.rank}</div>
          <div className="suit">{card.suit}</div>
          <div className="bottom-right">{card.rank}</div>
        </>
      ) : null}
    </div>
  );
};

export default CardSlot;
