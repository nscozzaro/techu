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

// --- Helper to render Deck Cell ---
const renderDeck = (
  deckCount: number,
  playerId: PlayerEnum,
  clearHighlights: () => void,
  isCurrentPlayer: boolean
) => (
  <Cell
    type="deck"
    count={deckCount}
    playerId={playerId}
    isFaceDown={false}
    clearHighlights={clearHighlights}
    isCurrentPlayer={isCurrentPlayer}
  />
);

// --- Helper to render Discard Cell ---
const renderDiscard = (
  discardPile: Card[],
  playerId: PlayerEnum,
  clearHighlights: () => void,
  isCurrentPlayer: boolean,
  isDisabled: boolean,
  isHighlighted: boolean,
  handleCardDiscard: (cardIndex: number, playerId: PlayerEnum) => void
) => (
  <Cell
    type="discard"
    stack={discardPile}
    playerId={playerId}
    isVisible={true}
    handleCardDiscard={handleCardDiscard}
    clearHighlights={clearHighlights}
    isCurrentPlayer={isCurrentPlayer}
    isDisabled={isDisabled}
    isHighlighted={isHighlighted}
  />
);

// --- Helper to render Hand Cells ---
// If reverse is true, the hand order is reversed.
const renderHand = (
  handCards: (Card | undefined)[],
  playerId: PlayerEnum,
  clearHighlights: () => void,
  handleCardDrag: ((cardIndex: number, playerId: PlayerEnum) => void) | undefined,
  handleDragStart: (playerId: PlayerEnum) => void,
  handleDragEnd: () => void,
  isCurrentPlayer: boolean,
  swapCardsInHand: ((playerId: PlayerEnum, sourceIndex: number, targetIndex: number) => void) | undefined,
  reverse: boolean = false
) => {
  const HAND_SIZE = 3;
  let handSlots = Array.from({ length: HAND_SIZE }, (_, index) => handCards[index]);
  if (reverse) {
    handSlots = handSlots.slice().reverse();
  }
  return handSlots.map((card, index) => (
    <Cell
      key={index}
      type="hand"
      card={card}
      index={index}
      playerId={playerId}
      handleCardDrag={handleCardDrag}
      highlightedCells={[]}
      clearHighlights={clearHighlights}
      onDragStart={() => handleDragStart(playerId)}
      onDragEnd={handleDragEnd}
      isCurrentPlayer={isCurrentPlayer}
      swapCardsInHand={swapCardsInHand}
    />
  ));
};

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
  return (
    <div className="player-area">
      {playerId === PlayerEnum.PLAYER1 ? (
        <>
          {renderDeck(deckCount, playerId, clearHighlights, isCurrentPlayer)}
          {renderHand(
            handCards,
            playerId,
            clearHighlights,
            handleCardDrag,
            handleDragStart,
            handleDragEnd,
            isCurrentPlayer,
            swapCardsInHand
          )}
          {renderDiscard(discardPile, playerId, clearHighlights, isCurrentPlayer, firstMove, isDiscardPileHighlighted, handleCardDiscard)}
        </>
      ) : (
        <>
          {renderDiscard(discardPile, playerId, clearHighlights, isCurrentPlayer, firstMove, isDiscardPileHighlighted, handleCardDiscard)}
          {renderHand(
            handCards,
            playerId,
            clearHighlights,
            handleCardDrag,
            handleDragStart,
            handleDragEnd,
            isCurrentPlayer,
            swapCardsInHand,
            true
          )}
          {renderDeck(deckCount, playerId, clearHighlights, isCurrentPlayer)}
        </>
      )}
    </div>
  );
};

export default PlayerArea;
