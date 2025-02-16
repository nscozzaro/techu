// src/features/gameStatusSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PlayerEnum, PlayerBooleans, Card } from '../types';

// We'll store a face-down card along with the cellIndex it was placed on
export interface FaceDownCard extends Card {
  cellIndex: number;
}

interface GameStatusState {
  firstMove: PlayerBooleans;
  gameOver: boolean;
  tieBreaker: boolean;
  // New property: a record of which face-down card each player has placed
  initialFaceDownCards: {
    [key in PlayerEnum]?: FaceDownCard;
  };
}

// Initial state with empty record for initialFaceDownCards
const initialState: GameStatusState = {
  firstMove: {
    [PlayerEnum.PLAYER1]: true,
    [PlayerEnum.PLAYER2]: true,
  },
  gameOver: false,
  tieBreaker: false,
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

    // New action to set (or update) a face-down card for one or both players
    setInitialFaceDownCards: (
      state,
      action: PayloadAction<{ [key in PlayerEnum]?: FaceDownCard }>
    ) => {
      // Merge new face-down cards into the existing record
      state.initialFaceDownCards = {
        ...state.initialFaceDownCards,
        ...action.payload,
      };
    },

    // New action to clear the face-down cards (e.g., after flipping them)
    clearInitialFaceDownCards: (state) => {
      state.initialFaceDownCards = {};
    },
  },
});

// Export actions and reducer
export const {
  setFirstMove,
  setGameOver,
  setTieBreaker,
  setInitialFaceDownCards,
  clearInitialFaceDownCards,
} = gameStatusSlice.actions;

export default gameStatusSlice.reducer;
