// src/components/Scoreboard.tsx
import React from 'react';
import { PlayerEnum, Score } from '../types';

interface ScoreboardProps {
  scores: { [key in PlayerEnum]: Score };
  gameOver: boolean;
}

const Scoreboard: React.FC<ScoreboardProps> = ({ scores, gameOver }) => {
  const winner = gameOver
    ? scores[PlayerEnum.PLAYER1] > scores[PlayerEnum.PLAYER2]
      ? 'Player 1 wins!'
      : scores[PlayerEnum.PLAYER1] < scores[PlayerEnum.PLAYER2]
      ? 'Player 2 wins!'
      : "It's a tie!"
    : '';
  return (
    <div className="scoreboard">
      <div>Player 1 Score: {scores[PlayerEnum.PLAYER1]}</div>
      <div>Player 2 Score: {scores[PlayerEnum.PLAYER2]}</div>
      {gameOver && <div className="winner">{winner}</div>}
    </div>
  );
};

export default Scoreboard;
