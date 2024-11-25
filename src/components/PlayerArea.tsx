// src/components/PlayerArea.tsx

import React, { useRef, useEffect, useState } from 'react';
import Cell from './Cell';
import { Card, PlayerEnum } from '../types';
import cardBackRed from '../assets/card-back-red.png';
import cardBackBlue from '../assets/card-back-blue.png';

interface PlayerAreaProps {
  playerId: PlayerEnum;
  deckCount: number;
  handCards: (Card | undefined)[];
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
  isCurrentPlayer: boolean;
  isDiscardPileHighlighted: boolean;
  swapCardsInHand?: (playerId: PlayerEnum, sourceIndex: number, targetIndex: number) => void;
  isDealingCard: boolean;
  dealingHandIndex?: number;
  drawingCard?: { playerId: PlayerEnum; handIndex: number } | null;
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
  isDealingCard,
  dealingHandIndex,
  drawingCard,
}) => {
  // Define the number of hand slots
  const HAND_SIZE = 3;

  // Create an array of hand slots, filling with undefined if not enough cards
  const handSlots = Array.from({ length: HAND_SIZE }, (_, index) => handCards[index]);

  // Refs for Deck and Hand Slots
  const deckRef = useRef<HTMLDivElement>(null);
  const handSlotRefs = useRef<Array<HTMLDivElement | null>>([]);

  // State for Dealing Card Position
  const [dealingCardStyle, setDealingCardStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    if ((isDealingCard || drawingCard) && deckRef.current && dealingHandIndex !== undefined) {
      const deckRect = deckRef.current.getBoundingClientRect();
      const targetHandIndex = drawingCard ? drawingCard.handIndex : dealingHandIndex;
      const handRect = handSlotRefs.current[targetHandIndex]?.getBoundingClientRect();

      if (handRect) {
        const initialStyle: React.CSSProperties = {
          position: 'absolute',
          width: deckRect.width,
          height: deckRect.height,
          left: deckRect.left - handRect.left,
          top: deckRect.top - handRect.top,
          transition: 'left 1s ease, top 1s ease',
          zIndex: 1000,
        };

        setDealingCardStyle(initialStyle);

        // Move to hand position after a short delay to allow rendering
        setTimeout(() => {
          setDealingCardStyle(prevStyle => prevStyle && {
            ...prevStyle,
            left: 0,
            top: 0,
          });
        }, 50); // Slight delay
      }
    }
  }, [isDealingCard, dealingHandIndex, drawingCard]);

  useEffect(() => {
    if (!isDealingCard && !drawingCard) {
      // Remove dealing card after animation
      setTimeout(() => {
        setDealingCardStyle(null);
      }, 1000); // Match transition duration
    }
  }, [isDealingCard, drawingCard]);

  return (
    <div className="player-area" style={{ position: 'relative' }}>
      {playerId === PlayerEnum.PLAYER1 ? (
        <>
          {/* Deck Cell */}
          <Cell
            type="deck"
            count={deckCount}
            playerId={playerId}
            isFaceDown={false}
            clearHighlights={clearHighlights}
            isCurrentPlayer={isCurrentPlayer}
            ref={deckRef} // Assign ref
          />

          {/* Hand Cells */}
          {handSlots.map((card, index) => (
            <Cell
              key={index}
              ref={el => (handSlotRefs.current[index] = el)} // Assign ref
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
            >
              {/* Dealing Card Animation */}
              {dealingCardStyle && ((isDealingCard && dealingHandIndex === index) || (drawingCard && drawingCard.handIndex === index)) && (
                <div style={dealingCardStyle}>
                  <div
                    className="card-back"
                    style={{
                      backgroundImage: `url(${cardBackRed})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      width: '100%',
                      height: '100%',
                    }}
                  />
                </div>
              )}
            </Cell>
          ))}

          {/* Discard Pile Cell */}
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
          {/* Discard Pile Cell */}
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

          {/* Hand Cells (reversed) */}
          {handSlots.slice().reverse().map((card, index) => {
            const actualIndex = handSlots.length - 1 - index;
            return (
              <Cell
                key={index}
                ref={el => (handSlotRefs.current[actualIndex] = el)} // Assign ref
                type="hand"
                card={card}
                index={actualIndex}
                playerId={playerId}
                handleCardDrag={handleCardDrag}
                highlightedCells={highlightedCells}
                clearHighlights={clearHighlights}
                onDragStart={() => handleDragStart(playerId)}
                onDragEnd={handleDragEnd}
                isCurrentPlayer={isCurrentPlayer}
              >
                {/* Dealing Card Animation */}
                {dealingCardStyle && ((isDealingCard && dealingHandIndex === actualIndex) || (drawingCard && drawingCard.handIndex === actualIndex)) && (
                  <div style={dealingCardStyle}>
                    <div
                      className="card-back"
                      style={{
                        backgroundImage: `url(${cardBackBlue})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        width: '100%',
                        height: '100%',
                      }}
                    />
                  </div>
                )}
              </Cell>
            );
          })}

          {/* Deck Cell */}
          <Cell
            type="deck"
            count={deckCount}
            playerId={playerId}
            isFaceDown={false}
            clearHighlights={clearHighlights}
            isCurrentPlayer={isCurrentPlayer}
            ref={deckRef} // Assign ref
          />
        </>
      )}
    </div>
  );
};

export default PlayerArea;
