// src/features/playersSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Players, PlayerEnum, ColorEnum } from '../types';
import { initializePlayer } from '../utils';

// Initialize players state (using the same logic as in your App component)
const initialState: Players = {
  [PlayerEnum.PLAYER1]: initializePlayer(ColorEnum.RED, PlayerEnum.PLAYER1),
  [PlayerEnum.PLAYER2]: initializePlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2),
};

const playersSlice = createSlice({
  name: 'players',
  initialState,
  reducers: {
    // Replaces the entire players state with a new state.
    updatePlayers: (state, action: PayloadAction<Players>) => {
      return action.payload;
    },
    // Optionally, you could add more granular actions here.
  },
});

export const { updatePlayers } = playersSlice.actions;
export default playersSlice.reducer;
