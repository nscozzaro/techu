// src/selectors.ts

import { createSelector } from '@reduxjs/toolkit';
import { RootState } from './store';
import { calculateScores } from './features/game';
import { PlayerEnum, Card } from './types';

/**
 * Existing selector to calculate scores
 */
export const selectScores = createSelector(
  (state: RootState) => state.game.board,
  (boardState) => calculateScores(boardState)
);

/**
 * New selector to determine if it's currently Player 1's turn and the game isn't over
 */
export const selectIsPlayer1Turn = (state: RootState): boolean =>
  state.game.turn.currentTurn === PlayerEnum.PLAYER1 && !state.game.gameStatus.gameOver;

/**
 * New selector that returns the hand in reverse order for Player2, normal for Player1
 */
export const selectHandForPlayer = (state: RootState, playerId: PlayerEnum): (Card | null)[] => {
  const hand = state.game.players[playerId].hand;
  return playerId === PlayerEnum.PLAYER2 ? [...hand].reverse() : hand;
};

/**
 * New selector that returns how many cards are in the player’s deck
 */
export const selectDeckCountForPlayer = (state: RootState, playerId: PlayerEnum): number => {
  return state.game.players[playerId].deck.length;
};
