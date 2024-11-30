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
  handleDragStart: (playerId: PlayerEnum, cardIndex: number) => void;
  handleDragEnd: () => void;
  isCurrentPlayer: boolean;
  isDiscardPileHighlighted: boolean;
  swapCardsInHand?: (playerId: PlayerEnum, sourceIndex: number, targetIndex: number) => void;
  dealingCards: Array<{ playerId: PlayerEnum; handIndex: number }>;
  drawingCard?: { playerId: PlayerEnum; handIndex: number } | null;
  handRefs?: React.MutableRefObject<Array<HTMLDivElement | null>>;
  playingCardAnimation?: {
    playerId: PlayerEnum;
    fromHandIndex: number;
    toBoardIndex: number;
    card: Card;
  } | null;
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
  dealingCards,
  drawingCard,
  handRefs,
  playingCardAnimation,
}) => {
  // Define the number of hand slots
  const HAND_SIZE = 3;

  // Create an array of hand slots, filling with undefined if not enough cards
  const handSlots = Array.from({ length: HAND_SIZE }, (_, index) => handCards[index]);

  // Refs for Deck and Hand Slots
  const deckRef = useRef<HTMLDivElement>(null);
  const handSlotRefs = useRef<Array<HTMLDivElement | null>>([]);

  const playerAreaRef = useRef<HTMLDivElement>(null);

  // State for Dealing Card Positions
  const [dealingCardsData, setDealingCardsData] = useState<Array<{
    handIndex: number;
    style: React.CSSProperties;
    cardBackImage: string;
  }>>([]);

  // Handle dealing card animation
  useEffect(() => {
    if (dealingCards.length > 0 && deckRef.current && playerAreaRef.current) {
      const playerAreaRect = playerAreaRef.current.getBoundingClientRect();
      const newDealingCardsData: Array<{
        handIndex: number;
        style: React.CSSProperties;
        cardBackImage: string;
      }> = [];

      dealingCards.forEach(({ playerId: dealingPlayerId, handIndex }) => {
        if (dealingPlayerId === playerId && deckRef.current) {
          const deckRect = deckRef.current.getBoundingClientRect();
          const handRect = handSlotRefs.current[handIndex]?.getBoundingClientRect();

          if (handRect) {
            const initialLeft = deckRect.left - playerAreaRect.left;
            const initialTop = deckRect.top - playerAreaRect.top;

            const finalLeft = handRect.left - playerAreaRect.left;
            const finalTop = handRect.top - playerAreaRect.top;

            const initialStyle: React.CSSProperties = {
              position: 'absolute',
              width: deckRect.width,
              height: deckRect.height,
              left: initialLeft,
              top: initialTop,
              transition: 'left 1s ease, top 1s ease',
              zIndex: 1000,
            };

            newDealingCardsData.push({
              handIndex,
              style: initialStyle,
              cardBackImage: playerId === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue,
            });

            // Move to hand position after a short delay to allow rendering
            setTimeout(() => {
              setDealingCardsData(prev =>
                prev.map(dc =>
                  dc.handIndex === handIndex
                    ? {
                        ...dc,
                        style: {
                          ...dc.style,
                          left: finalLeft,
                          top: finalTop,
                        },
                      }
                    : dc
                )
              );
            }, 50); // Slight delay
          }
        }
      });

      setDealingCardsData(newDealingCardsData);

      // Remove dealing cards after animation
      setTimeout(() => {
        setDealingCardsData([]);
      }, 1000); // Match transition duration
    }
  }, [dealingCards, playerId]);

  // Handle drawing card animation
  useEffect(() => {
    if (drawingCard && drawingCard.playerId === playerId && deckRef.current && playerAreaRef.current) {
      const playerAreaRect = playerAreaRef.current.getBoundingClientRect();
      const deckRect = deckRef.current.getBoundingClientRect();
      const handRect = handSlotRefs.current[drawingCard.handIndex]?.getBoundingClientRect();

      if (handRect) {
        const initialLeft = deckRect.left - playerAreaRect.left;
        const initialTop = deckRect.top - playerAreaRect.top;

        const finalLeft = handRect.left - playerAreaRect.left;
        const finalTop = handRect.top - playerAreaRect.top;

        const initialStyle: React.CSSProperties = {
          position: 'absolute',
          width: deckRect.width,
          height: deckRect.height,
          left: initialLeft,
          top: initialTop,
          transition: 'left 1s ease, top 1s ease',
          zIndex: 1000,
        };

        setDealingCardsData([
          {
            handIndex: drawingCard.handIndex,
            style: initialStyle,
            cardBackImage: playerId === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue,
          },
        ]);

        // Move to hand position after a short delay to allow rendering
        setTimeout(() => {
          setDealingCardsData(prev =>
            prev.map(dc =>
              dc.handIndex === drawingCard.handIndex
                ? {
                    ...dc,
                    style: {
                      ...dc.style,
                      left: finalLeft,
                      top: finalTop,
                    },
                  }
                : dc
            )
          );
        }, 50); // Slight delay

        // Remove dealing card after animation
        setTimeout(() => {
          setDealingCardsData([]);
        }, 1000); // Match transition duration
      }
    }
  }, [drawingCard, playerId]);

  return (
    <div className="player-area" style={{ position: 'relative' }} ref={playerAreaRef}>
      {playerId === PlayerEnum.PLAYER1 ? (
        <>
          {/* Deck Cell */}
          <Cell
            type="deck"
            count={deckCount}
            playerId={playerId}
            clearHighlights={clearHighlights}
            isCurrentPlayer={isCurrentPlayer}
            ref={deckRef} // Assign ref
            // Removed isFaceDown and draggedCard props
          />

          {/* Hand Cells */}
          {handSlots.map((card, index) => {
            return (
              <Cell
                key={index}
                ref={el => (handSlotRefs.current[index] = el)}
                type="hand"
                card={card}
                index={index}
                playerId={playerId}
                handleCardDrag={handleCardDrag}
                highlightedCells={highlightedCells}
                clearHighlights={clearHighlights}
                onDragStart={() => handleDragStart(playerId, index)}
                onDragEnd={handleDragEnd}
                isCurrentPlayer={isCurrentPlayer}
                swapCardsInHand={swapCardsInHand}
                // Removed draggedCard prop
              />
            );
          })}

          {/* Dealing Cards */}
          {dealingCardsData.map(dc => (
            <div key={dc.handIndex} style={dc.style}>
              <div
                className="card-back"
                style={{
                  backgroundImage: `url(${dc.cardBackImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  width: '100%',
                  height: '100%',
                }}
              />
            </div>
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
            // Removed draggedCard prop
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
            // Removed draggedCard prop
          />

          {/* Hand Cells (reversed) */}
          {handSlots.slice().reverse().map((card, index) => {
            const actualIndex = handSlots.length - 1 - index;
            const isAnimating =
              playingCardAnimation && playingCardAnimation.fromHandIndex === actualIndex;
            const cardToRender = isAnimating ? undefined : card;

            return (
              <Cell
                key={index}
                ref={el => {
                  handSlotRefs.current[actualIndex] = el;
                  if (handRefs) {
                    handRefs.current[actualIndex] = el;
                  }
                }}
                type="hand"
                card={cardToRender} // Use cardToRender here
                index={actualIndex}
                playerId={playerId}
                handleCardDrag={handleCardDrag}
                highlightedCells={highlightedCells}
                clearHighlights={clearHighlights}
                onDragStart={() => handleDragStart(playerId, actualIndex)}
                onDragEnd={handleDragEnd}
                isCurrentPlayer={isCurrentPlayer}
                // Removed swapCardsInHand and draggedCard props
              />
            );
          })}

          {/* Dealing Cards */}
          {dealingCardsData.map(dc => (
            <div key={dc.handIndex} style={dc.style}>
              <div
                className="card-back"
                style={{
                  backgroundImage: `url(${dc.cardBackImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  width: '100%',
                  height: '100%',
                }}
              />
            </div>
          ))}

          {/* Deck Cell */}
          <Cell
            type="deck"
            count={deckCount}
            playerId={playerId}
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
