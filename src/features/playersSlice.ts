// src/features/playersSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Players, PlayerEnum, ColorEnum, Player } from '../types';
import { createDeck, shuffle } from '../logic/deck';

// Initialize a player with a deck and hand
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
    swapCardsInHand: (
      state,
      action: PayloadAction<{ playerId: PlayerEnum; sourceIndex: number; targetIndex: number }>
    ) => {
      const { playerId, sourceIndex, targetIndex } = action.payload;
      const player = state[playerId];
      if (
        sourceIndex < 0 ||
        sourceIndex >= player.hand.length ||
        targetIndex < 0 ||
        targetIndex >= player.hand.length
      ) {
        return;
      }
      [player.hand[sourceIndex], player.hand[targetIndex]] = [
        player.hand[targetIndex],
        player.hand[sourceIndex],
      ];
    },
  },
});

export const { updatePlayers, swapCardsInHand } = playersSlice.actions;
export default playersSlice.reducer;
