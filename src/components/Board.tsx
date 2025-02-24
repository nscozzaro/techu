// Board.tsx

import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import Cell from './Cell';
import { BoardState } from '../types';
import { selectIsPlayer1Turn } from '../selectors';

const Board: React.FC = () => {
  const { board, highlightedCells } = useSelector((state: RootState) => ({
    board: state.game.board as BoardState,
    highlightedCells: state.game.highlightedCells,
  }));

  // Use the new selector for determining if it's Player 1's turn
  const isPlayerTurn = useSelector(selectIsPlayer1Turn);

  return (
    <div className="board">
      {board.map((cellStack, index: number) => (
        <Cell
          key={index}
          type="board"
          stack={cellStack}
          index={index}
          playerTurn={isPlayerTurn}
          highlightedCells={highlightedCells}
          isCurrentPlayer={false}
        />
      ))}
    </div>
  );
};

export default Board;
