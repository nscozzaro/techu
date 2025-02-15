// src/store.ts
import { configureStore } from '@reduxjs/toolkit';
import discardReducer from './features/discardSlice';
import turnReducer from './features/turnSlice';
import playersReducer from './features/playersSlice';
import boardReducer from './features/boardSlice';

export const store = configureStore({
  reducer: {
    discard: discardReducer,
    turn: turnReducer,
    players: playersReducer,
    board: boardReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
