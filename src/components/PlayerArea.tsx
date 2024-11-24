// src/components/PlayerArea.tsx

import React from 'react';
import Cell from './Cell';
import { Card, PlayerEnum } from '../types';

interface PlayerAreaProps {
  playerId: PlayerEnum;
  deckCount: number;
  handCards: Card[];
  discardPile: Card[];
  isDragging: boolean;
  handleCardDrag?: (index: number, playerId: PlayerEnum) => void;
  handleCardDiscard: (cardIndex: number, playerId: PlayerEnum) => void;
  placeCardOnBoard: (index: number, cardIndex: number) => void;
  highlightedCells: number[];
  firstMove: boolean;
  clearHighlights: () => void;
  handleDragStart: (playerId: PlayerEnum) => void;
  handleDragEnd: () => void;
  isCurrentPlayer: boolean; // New Prop
}

const PlayerArea: React.FC<PlayerAreaProps> = ({
  playerId,
  deckCount,
  handCards,
  discardPile,
  isDragging,
  handleCardDrag,
  handleCardDiscard,
  placeCardOnBoard,
  highlightedCells,
  firstMove,
  clearHighlights,
  handleDragStart,
  handleDragEnd,
  isCurrentPlayer, // New Prop
}) => {
  // Define the number of hand slots
  const HAND_SIZE = 3;

  // Create an array of hand slots, filling with undefined if not enough cards
  const handSlots = Array.from({ length: HAND_SIZE }, (_, index) => handCards[index]);

  return (
    <div className="player-area">
      {playerId === PlayerEnum.PLAYER1 ? (
        <>
          {/* Deck Cell */}
          <Cell
            type="deck"
            count={deckCount}
            playerId={playerId}
            isFaceDown={false} // Deck is always face-down
            clearHighlights={clearHighlights}
            isCurrentPlayer={isCurrentPlayer} // Pass down
          />

          {/* Hand Cells */}
          {handSlots.map((card, index) => (
            <Cell
              key={index}
              type="hand"
              card={card}
              index={index}
              playerId={playerId}
              handleCardDrag={handleCardDrag}
              highlightedCells={highlightedCells}
              clearHighlights={clearHighlights}
              onDragStart={() => handleDragStart(playerId)}
              onDragEnd={handleDragEnd}
              isCurrentPlayer={isCurrentPlayer} // Pass down
            />
          ))}

          {/* Discard Pile Cell */}
          <Cell
            type="discard"
            stack={discardPile}
            playerId={playerId}
            isVisible={isDragging && !firstMove}
            handleCardDiscard={handleCardDiscard}
            clearHighlights={clearHighlights}
            isCurrentPlayer={isCurrentPlayer} // Pass down
          />
        </>
      ) : (
        <>
          {/* Discard Pile Cell */}
          <Cell
            type="discard"
            stack={discardPile}
            playerId={playerId}
            isVisible={isDragging && !firstMove}
            handleCardDiscard={handleCardDiscard}
            clearHighlights={clearHighlights}
            isCurrentPlayer={isCurrentPlayer} // Pass down
          />

          {/* Hand Cells (reversed) */}
          {handSlots.slice().reverse().map((card, index) => (
            <Cell
              key={index}
              type="hand"
              card={card}
              index={index}
              playerId={playerId}
              handleCardDrag={handleCardDrag}
              highlightedCells={highlightedCells}
              clearHighlights={clearHighlights}
              onDragStart={() => handleDragStart(playerId)}
              onDragEnd={handleDragEnd}
              isCurrentPlayer={isCurrentPlayer} // Pass down
            />
          ))}

          {/* Deck Cell */}
          <Cell
            type="deck"
            count={deckCount}
            playerId={playerId}
            isFaceDown={false} // Deck is always face-down
            clearHighlights={clearHighlights}
            isCurrentPlayer={isCurrentPlayer} // Pass down
          />
        </>
      )}
    </div>
  );
};

export default PlayerArea;
