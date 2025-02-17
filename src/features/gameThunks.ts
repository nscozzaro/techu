// src/features/gameThunks.ts
import { createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from '../store';
import {
  placeCardOnBoardLogic,
  isGameOver,
  getNextPlayerTurn,
  updatePlayerHandAndDrawCard,
  flipInitialCardsLogic,
} from '../utils';
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

    // If both tie-breaker cards are present, do the logic:
    if (
      initialFaceDownCards[PlayerEnum.PLAYER1] &&
      initialFaceDownCards[PlayerEnum.PLAYER2]
    ) {
      const result = flipInitialCardsLogic(initialFaceDownCards, state.board);

      // Update board
      dispatch(setBoardState(result.newBoardState));

      // If the ranks are equal => tieBreaker = true
      // else tieBreaker = false
      dispatch(setTieBreaker(result.tieBreaker));

      // If tieBreaker remains true => tieBreakInProgress stays true
      // If tieBreaker is false => tieBreakInProgress = false
      dispatch(setTieBreakInProgress(result.tieBreaker));

      // If the tie is resolved, nextPlayerTurn = lower card's owner
      dispatch(setTurn(result.nextPlayerTurn));

      // If the game might be over
      const isOver = isGameOver(state.players);
      dispatch(setGameOver(isOver));

      // Clear face-down cards
      dispatch(clearInitialFaceDownCards());

      // Set firstMove according to result
      dispatch(setFirstMove(result.firstMove));

      // Clear highlights
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

    // If the game might be over
    if (isGameOver(result.updatedPlayers)) {
      dispatch(setGameOver(true));
    }
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
