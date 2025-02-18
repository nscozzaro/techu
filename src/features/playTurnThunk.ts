// src/features/playTurnThunk.ts
import { createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { PlayerEnum, InitialFaceDownCards } from '../types';
import {
  performFirstMoveForPlayer,
  performRegularMoveForPlayer,
} from './gameLogic';
import { setInitialFaceDownCards, setFirstMove } from './gameStatusSlice';
import { updatePlayers } from './playersSlice';
import { setBoardState } from './boardSlice';
import { setTurn } from './turnSlice';
import { setHighlightedCells } from './uiSlice';
import { discardCardThunk } from './gameThunks';

export const playTurnThunk = createAsyncThunk(
  'game/playTurn',
  async (playerId: PlayerEnum, { getState, dispatch }) => {
    const state = getState() as RootState;
    const { players, board } = state;
    const { firstMove, tieBreaker } = state.gameStatus;

    if (firstMove[playerId]) {
      const result = performFirstMoveForPlayer(
        players,
        playerId,
        board,
        tieBreaker,
        (cards: InitialFaceDownCards) => dispatch(setInitialFaceDownCards(cards))
      );
      dispatch(updatePlayers(result.updatedPlayers));
      dispatch(setBoardState(result.newBoardState));
      dispatch(setFirstMove(result.newFirstMove));
      dispatch(setTurn(result.nextPlayerTurn));
      dispatch(setHighlightedCells([]));
    } else {
      const result = performRegularMoveForPlayer(players, playerId, board);
      dispatch(updatePlayers(result.updatedPlayers));
      dispatch(setBoardState(result.newBoardState));
      dispatch(setTurn(result.nextPlayerTurn));
      if (
        result.moveMade &&
        result.move &&
        result.move.type === 'discard' &&
        playerId === PlayerEnum.PLAYER2
      ) {
        dispatch(discardCardThunk({ cardIndex: result.move.cardIndex, playerId }));
      } else if (playerId === PlayerEnum.PLAYER2) {
        const firstDiscardableIndex = players[playerId].hand.findIndex((c) => c !== undefined);
        if (firstDiscardableIndex !== -1) {
          dispatch(discardCardThunk({ cardIndex: firstDiscardableIndex, playerId }));
        }
      }
    }
  }
);
