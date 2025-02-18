// src/App.tsx
import React, { useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Board from './components/Board';
import PlayerArea from './components/PlayerArea';
import {
  performFirstMoveForPlayer,
  performRegularMoveForPlayer,
  handleCardDragLogic,
  isGameOver,
} from './utils';
import { PlayerEnum, InitialFaceDownCards } from './types';
import { RootState, AppDispatch } from './store';
import { setTurn } from './features/turnSlice';
import { updatePlayers } from './features/playersSlice';
import { setBoardState } from './features/boardSlice';
import {
  setFirstMove,
  setGameOver,
  setInitialFaceDownCards,
} from './features/gameStatusSlice';
import {
  setHighlightedCells,
  setDraggingPlayer,
  setHighlightDiscardPile,
  resetUI,
} from './features/uiSlice';
import { selectScores } from './selectors';
import {
  flipInitialCardsThunk,
  placeCardOnBoardThunk,
  discardCardThunk,
} from './features/gameThunks';

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
      dispatch(
        discardCardThunk({
          cardIndex,
          playerId,
        })
      );
    },
    [gameOver, firstMove, dispatch]
  );

  // AI or auto-play logic for Player 2
  const playForPlayer = useCallback(
    (playerId: PlayerEnum) => {
      if (gameOver) return;
      const isFirst = firstMove[playerId];
      if (isFirst) {
        const result = performFirstMoveForPlayer(
          players,
          playerId,
          boardState,
          tieBreaker,
          (cards: InitialFaceDownCards) => dispatch(setInitialFaceDownCards(cards))
        );
        dispatch(updatePlayers(result.updatedPlayers));
        dispatch(setBoardState(result.newBoardState));
        dispatch(setFirstMove(result.newFirstMove));
        dispatch(setTurn(result.nextPlayerTurn));
        dispatch(setHighlightedCells([]));
      } else {
        const result = performRegularMoveForPlayer(players, playerId, boardState);
        dispatch(updatePlayers(result.updatedPlayers));
        dispatch(setBoardState(result.newBoardState));
        dispatch(setTurn(result.nextPlayerTurn));

        const { moveMade, move } = result;
        if (moveMade && move && move.type === 'discard' && playerId === PlayerEnum.PLAYER2) {
          handleCardDiscard(move.cardIndex, PlayerEnum.PLAYER2);
        }
        if (!moveMade && playerId === PlayerEnum.PLAYER2) {
          // If no valid move, discard first available
          const firstDiscardableIndex = players[PlayerEnum.PLAYER2].hand.findIndex(
            (c) => c !== undefined
          );
          if (firstDiscardableIndex !== -1) {
            handleCardDiscard(firstDiscardableIndex, PlayerEnum.PLAYER2);
          }
        }
      }
    },
    [gameOver, firstMove, players, boardState, tieBreaker, dispatch, handleCardDiscard]
  );

  // When dragging a card
  const handleCardDrag = (cardIndex: number, playerId: PlayerEnum) => {
    if (gameOver) return;

    // 1) Only show highlights for Player 1:
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
    // highlight discard if not firstMove
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
    dispatch(updatePlayers(updatedPlayers));
  };

  // When both tie-breaker cards are placed, we flip them in Redux
  useEffect(() => {
    if (
      initialFaceDownCards[PlayerEnum.PLAYER1] &&
      initialFaceDownCards[PlayerEnum.PLAYER2]
    ) {
      dispatch(setHighlightedCells([]));
      dispatch(flipInitialCardsThunk());
    }
  }, [initialFaceDownCards, dispatch]);

  // If it's Player 2's turn, auto-play
  useEffect(() => {
    if (currentTurn === PlayerEnum.PLAYER2 && !gameOver) {
      setTimeout(() => playForPlayer(PlayerEnum.PLAYER2), 500);
    }
  }, [currentTurn, gameOver, playForPlayer]);

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
      <div style={{ margin: '10px' }}>
        <button onClick={() => dispatch({ type: 'RESET_GAME' })}>Reset Game</button>
      </div>
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
