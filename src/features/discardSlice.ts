// src/features/discardSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Card, PlayerEnum } from '../types';

interface DiscardPilesState {
  [PlayerEnum.PLAYER1]: Card[];
  [PlayerEnum.PLAYER2]: Card[];
}

const initialState: DiscardPilesState = {
  [PlayerEnum.PLAYER1]: [],
  [PlayerEnum.PLAYER2]: [],
};

const discardSlice = createSlice({
  name: 'discard',
  initialState,
  reducers: {
    addDiscardCard: (
      state,
      action: PayloadAction<{ playerId: PlayerEnum; card: Card }>
    ) => {
      state[action.payload.playerId].push(action.payload.card);
    },
    resetDiscardPiles: () => initialState,
  },
});

export const { addDiscardCard, resetDiscardPiles } = discardSlice.actions;
export default discardSlice.reducer;
