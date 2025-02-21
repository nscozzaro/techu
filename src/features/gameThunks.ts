import { createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from '../store';
import {
  placeCardOnBoardLogic,
  isGameOver,
  getNextPlayerTurn,
  updatePlayerHandAndDrawCard,
  flipInitialCardsLogic,
  handleCardDragLogic,
} from './gameLogic';
import {
  updatePlayers,
  setBoardState,
  setTurn,
  setFirstMove,
  setGameOver,
  setInitialFaceDownCards,
  clearInitialFaceDownCards,
  setTieBreaker,
  setTieBreakInProgress,
  addDiscardCard,
  setHighlightedCells,
  setHighlightDiscardPile,
} from './gameSlice';
import { PlayerEnum, InitialFaceDownCards } from '../types';

export const flipInitialCardsThunk = createAsyncThunk(
  'game/flipInitialCards',
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    const { initialFaceDownCards } = state.game.gameStatus;

    if (
      initialFaceDownCards[PlayerEnum.PLAYER1] &&
      initialFaceDownCards[PlayerEnum.PLAYER2]
    ) {
      const result = flipInitialCardsLogic(initialFaceDownCards, state.game.board);
      dispatch(setBoardState(result.newBoardState));
      dispatch(setTieBreaker(result.tieBreaker));
      dispatch(setTieBreakInProgress(result.tieBreaker));
      dispatch(setTurn(result.nextPlayerTurn));
      dispatch(setGameOver(isGameOver(state.game.players)));
      dispatch(clearInitialFaceDownCards());
      dispatch(setFirstMove(result.firstMove));
      dispatch(setHighlightedCells([]));
    }
  }
);

interface PlaceCardPayload {
  index: number;
  cardIndex: number;
}

export const placeCardOnBoardThunk = createAsyncThunk(
  'game/placeCardOnBoard',
  async ({ index, cardIndex }: PlaceCardPayload, { getState, dispatch }) => {
    const state = getState() as RootState;
    const players = state.game.players;
    const boardState = state.game.board;
    const firstMove = state.game.gameStatus.firstMove;
    const tieBreaker = state.game.gameStatus.tieBreaker;
    const currentPlayer = state.game.turn.currentTurn;

    const result = placeCardOnBoardLogic(
      index,
      cardIndex,
      currentPlayer,
      players,
      boardState,
      firstMove,
      tieBreaker,
      (cards: InitialFaceDownCards) => dispatch(setInitialFaceDownCards(cards))
    );

    dispatch(updatePlayers(result.updatedPlayers));
    dispatch(setBoardState(result.newBoardState));
    dispatch(setFirstMove(result.newFirstMove));
    dispatch(setTurn(result.nextPlayerTurn));

    if (isGameOver(result.updatedPlayers)) {
      dispatch(setGameOver(true));
    }

    dispatch(setHighlightedCells([]));
    dispatch(setHighlightDiscardPile(false));

    return result;
  }
);

export const discardCardThunk = createAsyncThunk(
  'game/discardCard',
  async ({ cardIndex, playerId }: { cardIndex: number; playerId: PlayerEnum }, { getState, dispatch }) => {
    const state = getState() as RootState;
    const players = state.game.players;
    const { gameOver, firstMove } = state.game.gameStatus;
    if (gameOver || firstMove[playerId]) {
      return;
    }
    const updatedPlayers = { ...players };
    const player = updatedPlayers[playerId];
    if (cardIndex < 0 || cardIndex >= player.hand.length) return;
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

    return newPlayers;
  }
);

export const triggerCardDragThunk = createAsyncThunk(
  'game/triggerCardDrag',
  async ({ cardIndex, playerId }: { cardIndex: number; playerId: PlayerEnum }, { getState, dispatch }) => {
    const state = getState() as RootState;
    const { board, players, gameStatus, turn } = state.game;
    const validMoves = handleCardDragLogic(
      cardIndex,
      playerId,
      board,
      players,
      gameStatus.firstMove,
      gameStatus.tieBreaker
    );
    dispatch(setHighlightedCells(validMoves));
    if (turn.currentTurn === playerId) {
      dispatch(setHighlightDiscardPile(!gameStatus.firstMove[playerId]));
    } else {
      dispatch(setHighlightDiscardPile(false));
    }
  }
);
