// src/components/Board.tsx

import React from 'react';
import Cell from './Cell';
import { BoardState } from '../types';

interface BoardProps {
  boardState: BoardState;
  isPlayerTurn: boolean;
  placeCardOnBoard: (index: number, cardIndex: number) => void;
  highlightedCells: number[];
  cellRefs?: React.MutableRefObject<Array<HTMLDivElement | null>>;
}

const Board: React.FC<BoardProps> = ({
  boardState,
  isPlayerTurn,
  placeCardOnBoard,
  highlightedCells,
  cellRefs,
}) => (
  <div className="board">
    {boardState.map((cellStack, index) => (
      <Cell
        key={index}
        ref={el => {
          if (cellRefs) {
            cellRefs.current[index] = el;
          }
        }}
        type="board"
        stack={cellStack}
        index={index}
        playerTurn={isPlayerTurn}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
        isCurrentPlayer={false}
      />
    ))}
  </div>
);

export default Board;
