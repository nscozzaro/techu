import { configureStore } from '@reduxjs/toolkit';
import gameReducer from './features/gameSlice';
import uiReducer from './features/uiSlice';

export const store = configureStore({
  reducer: {
    game: gameReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
