// src/App.tsx
import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Board from './components/Board';
import PlayerArea from './components/PlayerArea';
import Scoreboard from './components/Scoreboard';
import { isGameOver } from './features/game';
import { PlayerEnum } from './types';
import { RootState, AppDispatch } from './store';
import { setGameOver, setHighlightedCells, flipInitialCards, processTurn } from './features/game';
import { selectScores } from './selectors';

function App() {
  const players = useSelector((state: RootState) => state.game.players);
  const currentTurn = useSelector((state: RootState) => state.game.turn.currentTurn);
  const { initialFaceDownCards, gameOver } = useSelector((state: RootState) => state.game.gameStatus);
  const scores = useSelector(selectScores);
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    // Flip initial face-down cards if both players have one
    if (initialFaceDownCards[PlayerEnum.PLAYER1] && initialFaceDownCards[PlayerEnum.PLAYER2]) {
      dispatch(setHighlightedCells([]));
      dispatch(flipInitialCards());
    }
    // If it's Player2's turn and the game isn't over, process their turn
    if (currentTurn === PlayerEnum.PLAYER2 && !gameOver) {
      dispatch(processTurn({ playerId: PlayerEnum.PLAYER2 }));
    }
    // Check if the game is over
    if (isGameOver(players)) {
      dispatch(setGameOver(true));
    }
  }, [initialFaceDownCards, currentTurn, gameOver, players, dispatch]);

  return (
    <div className="App">
      <Scoreboard scores={scores} gameOver={gameOver} />
      <PlayerArea playerId={PlayerEnum.PLAYER2} />
      <Board />
      <PlayerArea playerId={PlayerEnum.PLAYER1} />
    </div>
  );
}

export default App;
