// src/features/gameStatusSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PlayerEnum, PlayerBooleans, Card } from '../types';

export interface FaceDownCard extends Card {
  cellIndex: number;
}

interface GameStatusState {
  firstMove: PlayerBooleans;
  gameOver: boolean;
  tieBreaker: boolean;
  // NEW: track if we are waiting for both tie-breaker cards
  tieBreakInProgress: boolean;
  initialFaceDownCards: {
    [key in PlayerEnum]?: FaceDownCard;
  };
}

const initialState: GameStatusState = {
  firstMove: {
    [PlayerEnum.PLAYER1]: true,
    [PlayerEnum.PLAYER2]: true,
  },
  gameOver: false,
  tieBreaker: false,
  tieBreakInProgress: false,
  initialFaceDownCards: {},
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
    // NEW: set tieBreakInProgress
    setTieBreakInProgress: (state, action: PayloadAction<boolean>) => {
      state.tieBreakInProgress = action.payload;
    },
    setInitialFaceDownCards: (
      state,
      action: PayloadAction<{ [key in PlayerEnum]?: FaceDownCard }>
    ) => {
      state.initialFaceDownCards = {
        ...state.initialFaceDownCards,
        ...action.payload,
      };
    },
    clearInitialFaceDownCards: (state) => {
      state.initialFaceDownCards = {};
    },
  },
});

export const {
  setFirstMove,
  setGameOver,
  setTieBreaker,
  setTieBreakInProgress,
  setInitialFaceDownCards,
  clearInitialFaceDownCards,
} = gameStatusSlice.actions;

export default gameStatusSlice.reducer;
