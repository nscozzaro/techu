// src/components/Board.tsx
import React from 'react';
import Cell from './Cell';
import { BoardState, Card, PlayerEnum } from '../types';

interface BoardProps {
  boardState: BoardState;
  isPlayerTurn: boolean;
  placeCardOnBoard: (index: number, cardIndex: number) => void;
  highlightedCells: number[];
  cellRefs?: React.MutableRefObject<Array<HTMLDivElement | null>>;
  playingCardAnimation?: {
    playerId: PlayerEnum;
    fromHandIndex: number;
    toBoardIndex: number;
    card: Card;
  } | null;
}

const Board: React.FC<BoardProps> = ({
  boardState,
  isPlayerTurn,
  placeCardOnBoard,
  highlightedCells,
  cellRefs,
  playingCardAnimation,
}) => (
  <div className="board">
    {boardState.map((cellStack, index) => {
      let stack = cellStack;

      if (
        playingCardAnimation &&
        playingCardAnimation.toBoardIndex === index
      ) {
        stack = cellStack.slice(0, -1);
      }

      return (
        <Cell
          key={index}
          ref={el => {
            if (cellRefs) {
              cellRefs.current[index] = el;
            }
          }}
          type="board"
          stack={stack}
          index={index}
          playerId={undefined}
          isVisible={true}
          handleCardDiscard={undefined}
          handleCardDrag={undefined}
          placeCardOnBoard={placeCardOnBoard}
          highlightedCells={highlightedCells}
          playerTurn={isPlayerTurn}
          isCurrentPlayer={false}
          // Removed draggedCard prop
        />
      );
    })}
  </div>
);

export default Board;
