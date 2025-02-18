// src/App.tsx
import React, { useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Board from './components/Board';
import PlayerArea from './components/PlayerArea';
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

  // Discard a card
  const handleCardDiscard = useCallback(
    (cardIndex: number, playerId: PlayerEnum) => {
      if (gameOver) return;
      if (firstMove[playerId]) return;
      dispatch(discardCardThunk({ cardIndex, playerId }));
    },
    [gameOver, firstMove, dispatch]
  );

  // When dragging a card
  const handleCardDrag = (cardIndex: number, playerId: PlayerEnum) => {
    if (gameOver) return;

    // Only show highlights for Player 1:
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
    // Highlight discard if not firstMove
    dispatch(setHighlightDiscardPile(!firstMove[playerId]));
  };

  // Place a card on the board
  const placeCardOnBoard = (index: number, cardIndex: number, playerId: PlayerEnum) => {
    if (gameOver) return;
    dispatch(placeCardOnBoardThunk({ index, cardIndex }));
  };

  // Drag event handlers
  const handleDragStart = (playerId: PlayerEnum) => {
    dispatch(setDraggingPlayer(playerId));
  };
  const handleDragEnd = () => {
    dispatch(resetUI());
  };

  // Swap cards in Player 1's hand
  const swapCardsInHand = (
    playerId: PlayerEnum,
    sourceIndex: number,
    targetIndex: number
  ) => {
    if (playerId !== PlayerEnum.PLAYER1) return;
    const player = players[playerId];
    if (
      sourceIndex < 0 ||
      sourceIndex >= player.hand.length ||
      targetIndex < 0 ||
      targetIndex >= player.hand.length
    ) {
      return;
    }
    const updatedHand = [...player.hand];
    [updatedHand[sourceIndex], updatedHand[targetIndex]] = [
      updatedHand[targetIndex],
      updatedHand[sourceIndex],
    ];
    const updatedPlayers = {
      ...players,
      [playerId]: { ...player, hand: updatedHand },
    };
    dispatch({ type: 'players/updatePlayers', payload: updatedPlayers });
  };

  // When both tie-breaker cards are placed, flip them in Redux
  useEffect(() => {
    if (initialFaceDownCards[PlayerEnum.PLAYER1] && initialFaceDownCards[PlayerEnum.PLAYER2]) {
      dispatch(setHighlightedCells([]));
      dispatch(flipInitialCardsThunk());
    }
  }, [initialFaceDownCards, dispatch]);

  // If it's Player 2's turn, auto-play via the thunk
  useEffect(() => {
    if (currentTurn === PlayerEnum.PLAYER2 && !gameOver) {
      setTimeout(() => {
        dispatch(playTurnThunk(PlayerEnum.PLAYER2));
      }, 500);
    }
  }, [currentTurn, gameOver, dispatch]);

  // If the game might be over
  useEffect(() => {
    if (isGameOver(players)) {
      dispatch(setGameOver(true));
    }
  }, [players, dispatch]);

  // Winner display
  const winner = gameOver
    ? scores[PlayerEnum.PLAYER1] > scores[PlayerEnum.PLAYER2]
      ? 'Player 1 wins!'
      : scores[PlayerEnum.PLAYER1] < scores[PlayerEnum.PLAYER2]
      ? 'Player 2 wins!'
      : "It's a tie!"
    : '';

  return (
    <div className="App">
      <div className="scoreboard">
        <div>Player 1 Score: {scores[PlayerEnum.PLAYER1]}</div>
        <div>Player 2 Score: {scores[PlayerEnum.PLAYER2]}</div>
        {gameOver && <div className="winner">{winner}</div>}
      </div>

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
        swapCardsInHand={swapCardsInHand}
      />
    </div>
  );
}

export default App;
