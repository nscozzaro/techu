// src/App.tsx
import React, { useEffect, useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Board from './components/Board';
import PlayerArea from './components/PlayerArea';
import {
  getNextPlayerTurn,
  calculateScores,
  isGameOver,
  performFirstMoveForPlayer,
  performRegularMoveForPlayer,
  handleCardDragLogic,
  flipInitialCardsLogic,
  updatePlayerHandAndDrawCard,
} from './utils';
import { PlayerEnum, Card } from './types';
import { RootState, AppDispatch } from './store';
import { addDiscardCard } from './features/discardSlice';
import { setTurn } from './features/turnSlice';
import { updatePlayers } from './features/playersSlice';
import { setBoardState } from './features/boardSlice';
import { setFirstMove, setGameOver } from './features/gameStatusSlice';
import { setHighlightedCells, setDraggingPlayer, setHighlightDiscardPile, resetUI } from './features/uiSlice';
// In App.tsx, inside your component:
import { placeCardOnBoardThunk } from './features/gameThunks';


function App() {
  // Redux state selectors
  const players = useSelector((state: RootState) => state.players);
  const boardState = useSelector((state: RootState) => state.board);
  const currentTurn = useSelector((state: RootState) => state.turn.currentTurn);
  const discardPiles = useSelector((state: RootState) => state.discard);
  const { firstMove, gameOver } = useSelector((state: RootState) => state.gameStatus);
  const highlightedCells = useSelector((state: RootState) => state.ui.highlightedCells);
  const draggingPlayer = useSelector((state: RootState) => state.ui.draggingPlayer);
  const highlightDiscardPile = useSelector((state: RootState) => state.ui.highlightDiscardPile);

  const dispatch = useDispatch<AppDispatch>();

  // Other local state remains
  const [initialFaceDownCards, setInitialFaceDownCards] = useState<{
    [key in PlayerEnum]?: Card & { cellIndex: number };
  }>({});  
  const [tieBreaker, setTieBreaker] = useState(false);
  const [scores, setScores] = useState({
    [PlayerEnum.PLAYER1]: 0,
    [PlayerEnum.PLAYER2]: 0,
  });

  const handleCardDiscard = useCallback((cardIndex: number, playerId: PlayerEnum) => {
    if (gameOver) return;
    if (firstMove[playerId]) return;

    const updatedPlayers = { ...players };
    const player = updatedPlayers[playerId];

    if (cardIndex >= 0 && cardIndex < player.hand.length) {
      const cardToDiscard = player.hand[cardIndex];
      if (!cardToDiscard) return;
      const discardedCard = { ...cardToDiscard, faceDown: true };
      dispatch(addDiscardCard({ playerId, card: discardedCard }));

      const newPlayers = updatePlayerHandAndDrawCard(
        updatedPlayers,
        playerId,
        cardIndex,
        cardIndex
      );
      dispatch(updatePlayers(newPlayers));
      dispatch(setTurn(getNextPlayerTurn(playerId)));
      dispatch(setHighlightedCells([]));
      dispatch(setHighlightDiscardPile(false));
    }
  }, [gameOver, firstMove, players, dispatch]);

  const playForPlayer = useCallback((playerId: PlayerEnum) => {
    if (gameOver) return;
    const isFirst = firstMove[playerId];

    if (isFirst) {
      const result = performFirstMoveForPlayer(
        players,
        playerId,
        boardState,
        tieBreaker,
        setInitialFaceDownCards
      );
      dispatch(updatePlayers(result.updatedPlayers));
      dispatch(setBoardState(result.newBoardState));
      dispatch(setFirstMove(result.newFirstMove));
      dispatch(setTurn(result.nextPlayerTurn));
      dispatch(setHighlightedCells([]));
    } else {
      const result = performRegularMoveForPlayer(
        players,
        playerId,
        boardState
      );
      dispatch(updatePlayers(result.updatedPlayers));
      dispatch(setBoardState(result.newBoardState));
      dispatch(setTurn(result.nextPlayerTurn));
      const { moveMade, move } = result;

      if (moveMade && move) {
        if (move.type === 'discard' && playerId === PlayerEnum.PLAYER2) {
          handleCardDiscard(move.cardIndex, PlayerEnum.PLAYER2);
        }
      }

      if (!moveMade && playerId === PlayerEnum.PLAYER2) {
        const firstDiscardableIndex = players[PlayerEnum.PLAYER2].hand.findIndex(card => card !== undefined);
        if (firstDiscardableIndex !== -1) {
          handleCardDiscard(firstDiscardableIndex, PlayerEnum.PLAYER2);
        }
      }
    }
  }, [gameOver, firstMove, players, boardState, tieBreaker, dispatch, handleCardDiscard]);

  const handleCardDrag = (cardIndex: number, playerId: PlayerEnum) => {
    if (gameOver) return;
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

  // Replace your existing placeCardOnBoard with:
  const placeCardOnBoard = (index: number, cardIndex: number) => {
    if (gameOver) return;
    dispatch(placeCardOnBoardThunk({ index, cardIndex, setInitialFaceDownCards }));
  };

  const handleDragStart = (playerId: PlayerEnum) => {
    dispatch(setDraggingPlayer(playerId));
  };

  const handleDragEnd = () => {
    dispatch(resetUI());
  };

  const swapCardsInHand = (playerId: PlayerEnum, sourceIndex: number, targetIndex: number) => {
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
    const temp = updatedHand[sourceIndex];
    updatedHand[sourceIndex] = updatedHand[targetIndex];
    updatedHand[targetIndex] = temp;

    const updatedPlayers = {
      ...players,
      [playerId]: {
        ...player,
        hand: updatedHand,
      },
    };
    dispatch(updatePlayers(updatedPlayers));
  };

  useEffect(() => {
    if (
      initialFaceDownCards[PlayerEnum.PLAYER1] &&
      initialFaceDownCards[PlayerEnum.PLAYER2]
    ) {
      setTimeout(() => {
        const result = flipInitialCardsLogic(
          initialFaceDownCards,
          boardState
        );
        dispatch(setBoardState(result.newBoardState));
        dispatch(setTurn(result.nextPlayerTurn));
        setTieBreaker(result.tieBreaker);
        setInitialFaceDownCards({});
        dispatch(setFirstMove(result.firstMove));
      }, 500);
    }
  }, [initialFaceDownCards, boardState, dispatch]);

  useEffect(() => {
    if (currentTurn === PlayerEnum.PLAYER2 && !gameOver) {
      if (!firstMove[PlayerEnum.PLAYER2]) {
        setTimeout(() => playForPlayer(PlayerEnum.PLAYER2), 500);
      } else {
        playForPlayer(PlayerEnum.PLAYER2);
      }
    }
  }, [currentTurn, gameOver, firstMove, playForPlayer]);

  useEffect(() => {
    const newScores = calculateScores(boardState);
    setScores(newScores);
  }, [boardState]);

  useEffect(() => {
    if (isGameOver(players)) {
      dispatch(setGameOver(true));
    }
  }, [players, dispatch]);

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
