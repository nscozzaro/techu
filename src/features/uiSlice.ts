// src/features/uiSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PlayerEnum } from '../types';

interface UIState {
  highlightedCells: number[];
  draggingPlayer: PlayerEnum | null;
  highlightDiscardPile: boolean;
}

const initialState: UIState = {
  highlightedCells: [],
  draggingPlayer: null,
  highlightDiscardPile: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setHighlightedCells: (state, action: PayloadAction<number[]>) => {
      state.highlightedCells = action.payload;
    },
    setDraggingPlayer: (state, action: PayloadAction<PlayerEnum | null>) => {
      state.draggingPlayer = action.payload;
    },
    setHighlightDiscardPile: (state, action: PayloadAction<boolean>) => {
      state.highlightDiscardPile = action.payload;
    },
    resetUI: (state) => {
      state.highlightedCells = [];
      state.draggingPlayer = null;
      state.highlightDiscardPile = false;
    },
  },
});

export const { setHighlightedCells, setDraggingPlayer, setHighlightDiscardPile, resetUI } = uiSlice.actions;
export default uiSlice.reducer;
