// src/components/Board.tsx
import React from 'react';
import Cell from './Cell';
import { BoardState } from '../types';

interface BoardProps {
  boardState: BoardState;
  isPlayerTurn: boolean;
  placeCardOnBoard: (index: number, cardIndex: number) => void;
  highlightedCells: number[];
}

const Board: React.FC<BoardProps> = ({
  boardState,
  isPlayerTurn,
  placeCardOnBoard,
  highlightedCells,
}) => (
  <div className="board">
    {boardState.map((cellStack, index) => (
      <Cell
        key={index}
        type="board"
        stack={cellStack}
        index={index}
        playerTurn={isPlayerTurn}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
      />
    ))}
  </div>
);

export default Board;
