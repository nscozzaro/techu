import React from 'react';
import Cell from './Cell';
import { BoardState } from '../types';

interface BoardProps {
  boardSize: number;
  boardState: BoardState;
  playerTurn: boolean;
  placeCardOnBoard: (index: number, cardIndex: number) => void;
  highlightedCells: number[];
}

const Board: React.FC<BoardProps> = ({
  boardSize,
  boardState,
  playerTurn,
  placeCardOnBoard,
  highlightedCells,
}) => {
  const renderCells = () => {
    return boardState.map((cellStack, index) => (
      <Cell
        key={index}
        stack={cellStack}
        index={index}
        playerTurn={playerTurn}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
      />
    ));
  };

  return <div className="board">{renderCells()}</div>;
};

export default Board;
