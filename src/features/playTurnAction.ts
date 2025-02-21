// src/features/playTurnAction.ts
import { RootState, AppDispatch } from '../store';
import { PlayerEnum, InitialFaceDownCards } from '../types';
import { performFirstMoveForPlayer, performRegularMoveForPlayer } from './gameLogic';
import { setInitialFaceDownCards } from './gameSlice';
import { discardCard, applyGameUpdate } from './gameActions';
import { GameState } from './gameSlice';

export const playTurn = (playerId: PlayerEnum) => (dispatch: AppDispatch, getState: () => RootState) => {
  const state = getState().game;
  if (state.gameStatus.firstMove[playerId]) performFirstMove(dispatch, state, playerId);
  else performRegularTurn(dispatch, state, playerId);
};

const performFirstMove = (dispatch: AppDispatch, game: GameState, playerId: PlayerEnum) => {
  const result = performFirstMoveForPlayer(
    game.players,
    playerId,
    game.board,
    game.gameStatus.tieBreaker,
    (cards: InitialFaceDownCards) => dispatch(setInitialFaceDownCards(cards))
  );
  applyGameUpdate(dispatch, {
    updatedPlayers: result.updatedPlayers,
    newBoardState: result.newBoardState,
    newFirstMove: result.newFirstMove,
    nextPlayerTurn: result.nextPlayerTurn,
  });
};

const performRegularTurn = (dispatch: AppDispatch, game: GameState, playerId: PlayerEnum) => {
  const result = performRegularMoveForPlayer(game.players, playerId, game.board);
  applyGameUpdate(dispatch, {
    updatedPlayers: result.updatedPlayers,
    newBoardState: result.newBoardState,
    nextPlayerTurn: result.nextPlayerTurn,
  });
  if (playerId === PlayerEnum.PLAYER2) {
    if (result.moveMade && result.move && result.move.type === 'discard')
      dispatch(discardCard({ cardIndex: result.move.cardIndex, playerId }));
    else {
      const idx = game.players[playerId].hand.findIndex((c) => c !== undefined);
      if (idx !== -1) dispatch(discardCard({ cardIndex: idx, playerId }));
    }
  }
};
