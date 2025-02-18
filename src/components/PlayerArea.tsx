// src/components/PlayerArea.tsx
import React from 'react';
import Cell from './Cell';
import { Card, PlayerEnum } from '../types';

interface PlayerAreaProps {
  playerId: PlayerEnum;
  deckCount: number;
  handCards: (Card | undefined)[];
  discardPile: Card[];
  isDragging: boolean;
  handleCardDrag?: (cardIndex: number, playerId: PlayerEnum) => void;
  handleCardDiscard: (cardIndex: number, playerId: PlayerEnum) => void;
  // Updated signature: now accepts playerId as the third parameter
  placeCardOnBoard: (index: number, cardIndex: number, playerId: PlayerEnum) => void;
  highlightedCells: number[];
  firstMove: boolean;
  clearHighlights: () => void;
  handleDragStart: (playerId: PlayerEnum) => void;
  handleDragEnd: () => void;
  isCurrentPlayer: boolean;
  isDiscardPileHighlighted: boolean;
  swapCardsInHand?: (playerId: PlayerEnum, sourceIndex: number, targetIndex: number) => void;
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
  isCurrentPlayer,
  isDiscardPileHighlighted,
  swapCardsInHand,
}) => {
  const HAND_SIZE = 3;
  const handSlots = Array.from({ length: HAND_SIZE }, (_, index) => handCards[index]);

  return (
    <div className="player-area">
      {playerId === PlayerEnum.PLAYER1 ? (
        <>
          <Cell
            type="deck"
            count={deckCount}
            playerId={playerId}
            isFaceDown={false}
            clearHighlights={clearHighlights}
            isCurrentPlayer={isCurrentPlayer}
          />
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
              isCurrentPlayer={isCurrentPlayer}
              swapCardsInHand={swapCardsInHand}
            />
          ))}
          <Cell
            type="discard"
            stack={discardPile}
            playerId={playerId}
            isVisible={true}
            handleCardDiscard={handleCardDiscard}
            clearHighlights={clearHighlights}
            isCurrentPlayer={isCurrentPlayer}
            isDisabled={firstMove}
            isHighlighted={isDiscardPileHighlighted}
          />
        </>
      ) : (
        <>
          <Cell
            type="discard"
            stack={discardPile}
            playerId={playerId}
            isVisible={true}
            handleCardDiscard={handleCardDiscard}
            clearHighlights={clearHighlights}
            isCurrentPlayer={isCurrentPlayer}
            isDisabled={firstMove}
            isHighlighted={isDiscardPileHighlighted}
          />
          {handSlots
            .slice()
            .reverse()
            .map((card, index) => (
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
                isCurrentPlayer={isCurrentPlayer}
              />
            ))}
          <Cell
            type="deck"
            count={deckCount}
            playerId={playerId}
            isFaceDown={false}
            clearHighlights={clearHighlights}
            isCurrentPlayer={isCurrentPlayer}
          />
        </>
      )}
    </div>
  );
};

export default PlayerArea;
