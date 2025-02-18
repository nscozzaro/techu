import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Board from './components/Board';
import PlayerArea from './components/PlayerArea';
import Scoreboard from './components/Scoreboard';
import { isGameOver } from './features/gameLogic';
import { PlayerEnum } from './types';
import { RootState, AppDispatch } from './store';
import { setGameOver } from './features/gameStatusSlice';
import { setHighlightedCells } from './features/uiSlice';
import { selectScores } from './selectors';
import { flipInitialCardsThunk } from './features/gameThunks';
import { playTurnThunk } from './features/playTurnThunk';

function App() {
  const players = useSelector((state: RootState) => state.players);
  const currentTurn = useSelector((state: RootState) => state.turn.currentTurn);
  const { initialFaceDownCards, gameOver } = useSelector((state: RootState) => state.gameStatus);
  const scores = useSelector(selectScores);
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (initialFaceDownCards[PlayerEnum.PLAYER1] && initialFaceDownCards[PlayerEnum.PLAYER2]) {
      dispatch(setHighlightedCells([]));
      dispatch(flipInitialCardsThunk());
    }
  }, [initialFaceDownCards, dispatch]);

  useEffect(() => {
    if (currentTurn === PlayerEnum.PLAYER2 && !gameOver) {
      setTimeout(() => {
        dispatch(playTurnThunk(PlayerEnum.PLAYER2));
      }, 500);
    }
  }, [currentTurn, gameOver, dispatch]);

  useEffect(() => {
    if (isGameOver(players)) {
      dispatch(setGameOver(true));
    }
  }, [players, dispatch]);

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
