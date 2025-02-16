// src/features/gameThunks.ts
import { createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { 
  placeCardOnBoardLogic, 
  isGameOver, 
  getNextPlayerTurn, 
  updatePlayerHandAndDrawCard 
} from '../utils';
import { updatePlayers } from './playersSlice';
import { setBoardState } from './boardSlice';
import { setTurn } from './turnSlice';
import { setFirstMove, setGameOver, setInitialFaceDownCards } from './gameStatusSlice';
import { setHighlightedCells, setHighlightDiscardPile } from './uiSlice';
import { addDiscardCard } from './discardSlice';
import { PlayerEnum } from '../types';

interface PlaceCardPayload {
  index: number;     // Board cell index where the card will be placed
  cardIndex: number; // The index of the card in the player's hand
}

/**
 * Thunk to handle placing a card on the board.
 * It calls the game logic (placeCardOnBoardLogic) and then dispatches
 * actions to update players, board, turn, and game status.
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

    const result = placeCardOnBoardLogic(
      index,
      cardIndex,
      players,
      boardState,
      firstMove,
      // Instead of using a local state setter, dispatch the Redux action
      (cards) => dispatch(setInitialFaceDownCards(cards))
    );

    // Dispatch updates to various slices:
    dispatch(updatePlayers(result.updatedPlayers));
    dispatch(setBoardState(result.newBoardState));
    dispatch(setFirstMove(result.newFirstMove));
    dispatch(setTurn(result.nextPlayerTurn));

    if (isGameOver(result.updatedPlayers)) {
      dispatch(setGameOver(true));
    }

    return result;
  }
);

/**
 * Thunk to handle discarding a card.
 * It updates the player's hand (removing the discarded card and drawing a new one),
 * dispatches an action to add the discarded card (as face-down) to the discard pile,
 * updates the turn, and resets UI highlights.
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
    
    // If the game is over or it's still the player's first move, do nothing.
    if (gameOver || firstMove[playerId]) {
      return;
    }
    
    const updatedPlayers = { ...players };
    const player = updatedPlayers[playerId];
    
    if (cardIndex < 0 || cardIndex >= player.hand.length) return;
    
    const cardToDiscard = player.hand[cardIndex];
    if (!cardToDiscard) return;
    
    // Create a face-down version of the card.
    const discardedCard = { ...cardToDiscard, faceDown: true };
    dispatch(addDiscardCard({ playerId, card: discardedCard }));
    
    const newPlayers = updatePlayerHandAndDrawCard(updatedPlayers, playerId, cardIndex, cardIndex);
    dispatch(updatePlayers(newPlayers));
    dispatch(setTurn(getNextPlayerTurn(playerId)));
    dispatch(setHighlightedCells([]));
    dispatch(setHighlightDiscardPile(false));
    
    return newPlayers;
  }
);
