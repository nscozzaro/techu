// src/App.tsx
import React, { useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Board from './components/Board';
import PlayerArea from './components/PlayerArea';
import Scoreboard from './components/Scoreboard';
import { handleCardDragLogic, isGameOver } from './features/gameLogic';
import { PlayerEnum } from './types';
import { RootState, AppDispatch } from './store';
import { setGameOver } from './features/gameStatusSlice';
import {
  setHighlightedCells,
  setDraggingPlayer,
  setHighlightDiscardPile,
  resetUI,
} from './features/uiSlice';
import { selectScores } from './selectors';
import {
  placeCardOnBoardThunk,
  discardCardThunk,
  flipInitialCardsThunk,
} from './features/gameThunks';
import { playTurnThunk } from './features/playTurnThunk';
import { swapCardsInHand } from './features/playersSlice';

function App() {
  const players = useSelector((state: RootState) => state.players);
  const boardState = useSelector((state: RootState) => state.board);
  const currentTurn = useSelector((state: RootState) => state.turn.currentTurn);
  const discardPiles = useSelector((state: RootState) => state.discard);
  const { firstMove, gameOver, initialFaceDownCards, tieBreaker } =
    useSelector((state: RootState) => state.gameStatus);
  const highlightedCells = useSelector((state: RootState) => state.ui.highlightedCells);
  const draggingPlayer = useSelector((state: RootState) => state.ui.draggingPlayer);
  const highlightDiscardPile = useSelector((state: RootState) => state.ui.highlightDiscardPile);
  const scores = useSelector(selectScores);

  const dispatch = useDispatch<AppDispatch>();

  const handleCardDiscard = useCallback(
    (cardIndex: number, playerId: PlayerEnum) => {
      if (gameOver) return;
      if (firstMove[playerId]) return;
      dispatch(discardCardThunk({ cardIndex, playerId }));
    },
    [gameOver, firstMove, dispatch]
  );

  const handleCardDrag = (cardIndex: number, playerId: PlayerEnum) => {
    if (gameOver) return;
    if (playerId !== PlayerEnum.PLAYER1) return;
    const validMoves = handleCardDragLogic(
      cardIndex,
      playerId,
      boardState,
      players,
      firstMove,
      tieBreaker
    );
    dispatch(setHighlightedCells(validMoves));
    dispatch(setHighlightDiscardPile(!firstMove[playerId]));
  };

  const placeCardOnBoard = (index: number, cardIndex: number, playerId: PlayerEnum) => {
    if (gameOver) return;
    dispatch(placeCardOnBoardThunk({ index, cardIndex }));
  };

  const handleDragStart = (playerId: PlayerEnum) => {
    dispatch(setDraggingPlayer(playerId));
  };
  const handleDragEnd = () => {
    dispatch(resetUI());
  };

  // New: dispatch Redux action to swap cards in hand
  const handleSwapCards = (playerId: PlayerEnum, sourceIndex: number, targetIndex: number) => {
    if (playerId !== PlayerEnum.PLAYER1) return;
    dispatch(swapCardsInHand({ playerId, sourceIndex, targetIndex }));
  };

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
      <PlayerArea
        playerId={PlayerEnum.PLAYER2}
        deckCount={players[PlayerEnum.PLAYER2].deck.length}
        handCards={players[PlayerEnum.PLAYER2].hand}
        discardPile={discardPiles[PlayerEnum.PLAYER2]}
        isDragging={draggingPlayer === PlayerEnum.PLAYER2}
        handleCardDrag={currentTurn === PlayerEnum.PLAYER2 ? handleCardDrag : undefined}
        handleCardDiscard={handleCardDiscard}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
        firstMove={firstMove[PlayerEnum.PLAYER2]}
        clearHighlights={() => dispatch(setHighlightedCells([]))}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        isCurrentPlayer={currentTurn === PlayerEnum.PLAYER2}
        isDiscardPileHighlighted={highlightDiscardPile && currentTurn === PlayerEnum.PLAYER2}
      />
      <Board
        boardState={boardState}
        isPlayerTurn={currentTurn === PlayerEnum.PLAYER1 && !gameOver}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
      />
      <PlayerArea
        playerId={PlayerEnum.PLAYER1}
        deckCount={players[PlayerEnum.PLAYER1].deck.length}
        handCards={players[PlayerEnum.PLAYER1].hand}
        discardPile={discardPiles[PlayerEnum.PLAYER1]}
        isDragging={draggingPlayer === PlayerEnum.PLAYER1}
        handleCardDrag={currentTurn === PlayerEnum.PLAYER1 ? handleCardDrag : undefined}
        handleCardDiscard={handleCardDiscard}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
        firstMove={firstMove[PlayerEnum.PLAYER1]}
        clearHighlights={() => dispatch(setHighlightedCells([]))}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        isCurrentPlayer={currentTurn === PlayerEnum.PLAYER1}
        isDiscardPileHighlighted={highlightDiscardPile && currentTurn === PlayerEnum.PLAYER1}
        swapCardsInHand={handleSwapCards}
      />
    </div>
  );
}

export default App;
