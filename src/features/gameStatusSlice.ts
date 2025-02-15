// src/features/gameStatusSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PlayerEnum, PlayerBooleans } from '../types';

interface GameStatusState {
  firstMove: PlayerBooleans;
  gameOver: boolean;
  tieBreaker: boolean;
}

const initialState: GameStatusState = {
  firstMove: {
    [PlayerEnum.PLAYER1]: true,
    [PlayerEnum.PLAYER2]: true,
  },
  gameOver: false,
  tieBreaker: false,
};

const gameStatusSlice = createSlice({
  name: 'gameStatus',
  initialState,
  reducers: {
    setFirstMove: (state, action: PayloadAction<PlayerBooleans>) => {
      state.firstMove = action.payload;
    },
    setGameOver: (state, action: PayloadAction<boolean>) => {
      state.gameOver = action.payload;
    },
    setTieBreaker: (state, action: PayloadAction<boolean>) => {
      state.tieBreaker = action.payload;
    },
  },
});

export const { setFirstMove, setGameOver, setTieBreaker } = gameStatusSlice.actions;
export default gameStatusSlice.reducer;
