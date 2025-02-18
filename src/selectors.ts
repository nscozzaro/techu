// src/selectors.ts
import { createSelector } from '@reduxjs/toolkit';
import { RootState } from './store';
import { calculateScores } from './features/gameLogic';

export const selectScores = createSelector(
  (state: RootState) => state.game.board,
  (boardState) => calculateScores(boardState)
);
