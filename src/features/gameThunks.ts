// src/features/gameThunks.ts
import { createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from '../store';
import {
  placeCardOnBoardLogic,
  isGameOver,
  getNextPlayerTurn,
  updatePlayerHandAndDrawCard,
  flipInitialCardsLogic,
} from './gameLogic';
import { updatePlayers } from './playersSlice';
import { setBoardState } from './boardSlice';
import { setTurn } from './turnSlice';
import {
  setFirstMove,
  setGameOver,
  setInitialFaceDownCards,
  clearInitialFaceDownCards,
  setTieBreaker,
  setTieBreakInProgress,
} from './gameStatusSlice';
import { setHighlightedCells, setHighlightDiscardPile } from './uiSlice';
import { addDiscardCard } from './discardSlice';
import { PlayerEnum, InitialFaceDownCards } from '../types';

/** 
 * Thunk to flip tie-breaker cards once both players have placed them.
 */
export const flipInitialCardsThunk = createAsyncThunk(
  'game/flipInitialCards',
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    const { initialFaceDownCards } = state.gameStatus;

    if (
      initialFaceDownCards[PlayerEnum.PLAYER1] &&
      initialFaceDownCards[PlayerEnum.PLAYER2]
    ) {
      const result = flipInitialCardsLogic(initialFaceDownCards, state.board);
      dispatch(setBoardState(result.newBoardState));
      dispatch(setTieBreaker(result.tieBreaker));
      dispatch(setTieBreakInProgress(result.tieBreaker));
      dispatch(setTurn(result.nextPlayerTurn));
      dispatch(setGameOver(isGameOver(state.players)));
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

/**
 * Thunk to place a card on the board.
 */
export const placeCardOnBoardThunk = createAsyncThunk(
  'game/placeCardOnBoard',
  async (
    { index, cardIndex }: PlaceCardPayload,
    { getState, dispatch }
  ) => {
    const state = getState() as RootState;
    const players = state.players;
    const boardState = state.board;
    const firstMove = state.gameStatus.firstMove;
    const tieBreaker = state.gameStatus.tieBreaker;
    const currentPlayer = state.turn.currentTurn;

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

/**
 * Thunk to handle discarding a card.
 */
export const discardCardThunk = createAsyncThunk(
  'game/discardCard',
  async (
    { cardIndex, playerId }: { cardIndex: number; playerId: PlayerEnum },
    { getState, dispatch }
  ) => {
    const state = getState() as RootState;
    const players = state.players;
    const { gameOver, firstMove } = state.gameStatus;
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
