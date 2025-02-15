// src/features/turnSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PlayerEnum } from '../types';

interface TurnState {
  currentTurn: PlayerEnum;
}

const initialState: TurnState = {
  currentTurn: PlayerEnum.PLAYER1,
};

const turnSlice = createSlice({
  name: 'turn',
  initialState,
  reducers: {
    setTurn: (state, action: PayloadAction<PlayerEnum>) => {
      state.currentTurn = action.payload;
    },
    nextTurn: (state) => {
      state.currentTurn =
        state.currentTurn === PlayerEnum.PLAYER1 ? PlayerEnum.PLAYER2 : PlayerEnum.PLAYER1;
    },
  },
});

export const { setTurn, nextTurn } = turnSlice.actions;
export default turnSlice.reducer;
