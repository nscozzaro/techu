import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import Cell from './Cell';
import { placeCardOnBoardThunk } from '../features/gameThunks';
import { PlayerEnum } from '../types';

const Board: React.FC = () => {
  const boardState = useSelector((state: RootState) => state.board);
  const highlightedCells = useSelector((state: RootState) => state.ui.highlightedCells);
  const currentTurn = useSelector((state: RootState) => state.turn.currentTurn);
  const gameOver = useSelector((state: RootState) => state.gameStatus.gameOver);
  const dispatch = useDispatch<AppDispatch>();

  const isPlayerTurn = currentTurn === PlayerEnum.PLAYER1 && !gameOver;

  const placeCardOnBoard = (index: number, cardIndex: number, playerId: PlayerEnum) => {
    if (!gameOver) {
      dispatch(placeCardOnBoardThunk({ index, cardIndex }));
    }
  };

  return (
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
          isCurrentPlayer={false}
        />
      ))}
    </div>
  );
};

export default Board;
