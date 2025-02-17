import React from 'react';
import Cell from './Cell';
import { BoardState, PlayerEnum } from '../types';

interface BoardProps {
  boardState: BoardState;
  isPlayerTurn: boolean;
  // *** Updated signature to include playerId ***
  placeCardOnBoard: (index: number, cardIndex: number, playerId: PlayerEnum) => void;
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
        isCurrentPlayer={false} // This is just a prop to disable hand-drag logic
      />
    ))}
  </div>
);

export default Board;
