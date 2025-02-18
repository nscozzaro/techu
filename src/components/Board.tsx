// src/components/Board.tsx
import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import Cell from './Cell';
import { PlayerEnum, BoardState } from '../types';

const Board: React.FC = () => {
  const { board, highlightedCells, currentTurn, gameOver } = useSelector(
    (state: RootState) => ({
      board: state.game.board as BoardState,
      highlightedCells: state.ui.highlightedCells,
      currentTurn: state.game.turn.currentTurn,
      gameOver: state.game.gameStatus.gameOver,
    })
  );

  const isPlayerTurn = currentTurn === PlayerEnum.PLAYER1 && !gameOver;

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
