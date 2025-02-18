// src/features/playersSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Players, PlayerEnum, ColorEnum, Player } from '../types';
import { createDeck, shuffle } from '../logic/deck';

// Moved from utils.tsx: initializePlayer
const initializePlayer = (color: ColorEnum, id: PlayerEnum): Player => {
  const deck = createDeck(color, id);
  shuffle(deck);
  return {
    id,
    hand: deck.slice(0, 3),
    deck: deck.slice(3),
  };
};

const initialState: Players = {
  [PlayerEnum.PLAYER1]: initializePlayer(ColorEnum.RED, PlayerEnum.PLAYER1),
  [PlayerEnum.PLAYER2]: initializePlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2),
};

const playersSlice = createSlice({
  name: 'players',
  initialState,
  reducers: {
    updatePlayers: (state, action: PayloadAction<Players>) => action.payload,
  },
});

export const { updatePlayers } = playersSlice.actions;
export default playersSlice.reducer;
