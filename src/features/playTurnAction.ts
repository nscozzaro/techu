import { RootState } from '../store';
import { PlayerEnum, InitialFaceDownCards } from '../types';
import { performFirstMoveForPlayer, performRegularMoveForPlayer } from './gameLogic';
import {
  setInitialFaceDownCards,
  setFirstMove,
  setTurn,
  updatePlayers,
  setBoardState,
  setHighlightedCells,
} from './gameSlice';
import { discardCard } from './gameActions';

export const playTurn = (playerId: PlayerEnum) => (dispatch: any, getState: () => RootState) => {
  const state = getState();
  const { players, board } = state.game;
  const { firstMove, tieBreaker } = state.game.gameStatus;

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
      dispatch(discardCard({ cardIndex: result.move.cardIndex, playerId }));
    } else if (!result.moveMade && playerId === PlayerEnum.PLAYER2) {
      const firstDiscardableIndex = players[playerId].hand.findIndex((c) => c !== undefined);
      if (firstDiscardableIndex !== -1) {
        dispatch(discardCard({ cardIndex: firstDiscardableIndex, playerId }));
      }
    }
  }
};
