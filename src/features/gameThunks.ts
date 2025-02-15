// src/features/gameThunks.ts
import { createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { placeCardOnBoardLogic, isGameOver } from '../utils';
import { updatePlayers } from './playersSlice';
import { setBoardState } from './boardSlice';
import { setTurn } from './turnSlice';
import { setFirstMove, setGameOver } from './gameStatusSlice';

interface PlaceCardPayload {
  index: number;     // Board cell index where the card will be placed
  cardIndex: number; // The index of the card in the player's hand
  setInitialFaceDownCards: React.Dispatch<React.SetStateAction<any>>; // Pass the setter from App.tsx
}

/**
 * Thunk to handle placing a card on the board.
 * It calls the game logic (placeCardOnBoardLogic) and then dispatches
 * actions to update players, board, turn, and game status.
 */
export const placeCardOnBoardThunk = createAsyncThunk(
  'game/placeCardOnBoard',
  async (
    { index, cardIndex, setInitialFaceDownCards }: PlaceCardPayload,
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
      setInitialFaceDownCards
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
