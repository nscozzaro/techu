// src/features/resetGameThunk.ts
import { createAsyncThunk } from '@reduxjs/toolkit';
import { PlayerEnum, BoardState } from '../types';
import { initializePlayer, initialBoardState } from '../utils';
import { updatePlayers } from './playersSlice';
import { setBoardState } from './boardSlice';
import { setTurn } from './turnSlice';
import { setFirstMove, setGameOver, setTieBreaker } from './gameStatusSlice';
import { resetUI } from './uiSlice';
import { resetDiscardPiles } from './discardSlice';

export const resetGameThunk = createAsyncThunk(
  'game/resetGame',
  async (_, { dispatch }) => {
    // Reset players using the original initialization logic:
    const initialPlayers = {
      [PlayerEnum.PLAYER1]: initializePlayer('RED' as any, PlayerEnum.PLAYER1),
      [PlayerEnum.PLAYER2]: initializePlayer('BLACK' as any, PlayerEnum.PLAYER2),
    };

    // Reset board state using the initialBoardState utility (assumes BOARD_SIZE is defined)
    const newBoardState: BoardState = initialBoardState();

    // Define initial first move status inline:
    const newFirstMove = {
      [PlayerEnum.PLAYER1]: true,
      [PlayerEnum.PLAYER2]: true,
    };

    // Dispatch reset actions:
    dispatch(updatePlayers(initialPlayers));
    dispatch(setBoardState(newBoardState));
    dispatch(setTurn(PlayerEnum.PLAYER1));
    dispatch(setFirstMove(newFirstMove));
    dispatch(setGameOver(false));
    dispatch(setTieBreaker(false));
    dispatch(resetUI());
    dispatch(resetDiscardPiles());

    return;
  }
);
