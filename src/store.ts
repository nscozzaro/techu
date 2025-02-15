// src/store.ts
import { configureStore } from '@reduxjs/toolkit';
import discardReducer from './features/discardSlice';
import turnReducer from './features/turnSlice';

export const store = configureStore({
  reducer: {
    discard: discardReducer,
    turn: turnReducer,
    // You can add more reducers here later
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
