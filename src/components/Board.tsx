import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import Cell from './Cell';
import { PlayerEnum } from '../types';
import { BoardState } from '../types';

const Board: React.FC = () => {
  const boardState = useSelector((state: RootState) => state.game.board);
  const highlightedCells = useSelector((state: RootState) => state.ui.highlightedCells);
  const currentTurn = useSelector((state: RootState) => state.game.turn.currentTurn);
  const gameOver = useSelector((state: RootState) => state.game.gameStatus.gameOver);

  const isPlayerTurn = currentTurn === PlayerEnum.PLAYER1 && !gameOver;

  return (
    <div className="board">
      {(boardState as BoardState).map((cellStack, index: number) => (
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
