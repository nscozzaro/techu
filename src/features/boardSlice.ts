// src/features/boardSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { BoardState, BOARD_SIZE } from '../types';

// Use Array.from to ensure each cell is its own array.
const initialState: BoardState = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => []);

const boardSlice = createSlice({
  name: 'board',
  initialState,
  reducers: {
    setBoardState: (state, action: PayloadAction<BoardState>) => {
      // Replace the entire board state.
      return action.payload;
    },
  },
});

export const { setBoardState } = boardSlice.actions;
export default boardSlice.reducer;
