// Board.tsx
import React from 'react';
import Cell from './Cell';
import { BoardState } from '../types';

interface BoardProps {
  boardState: BoardState;
  playerTurn: boolean;
  placeCardOnBoard: (index: number, cardIndex: number) => void;
  highlightedCells: number[];
}

const Board: React.FC<BoardProps> = ({
  boardState,
  playerTurn,
  placeCardOnBoard,
  highlightedCells,
}) => (
  <div className="board">
    {boardState.map((cellStack, index) => (
      <Cell
        key={index}
        stack={cellStack}
        index={index}
        playerTurn={playerTurn}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
      />
    ))}
  </div>
);

export default Board;
