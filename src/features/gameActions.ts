// src/features/gameActions.ts
import { RootState, AppDispatch } from '../store';
import {
  placeCardOnBoardLogic,
  isGameOver,
  getNextPlayerTurn,
  updatePlayerHandAndDrawCard,
  flipInitialCardsLogic,
  handleCardDragLogic,
} from './gameLogic';
import {
  updatePlayers,
  setBoardState,
  setTurn,
  setFirstMove,
  setGameOver,
  setInitialFaceDownCards,
  clearInitialFaceDownCards,
  setTieBreaker,
  setTieBreakInProgress,
  addDiscardCard,
  resetUI,
  setHighlightedCells,
  setHighlightDiscardPile,
} from './gameSlice';
import {
  PlayerEnum,
  InitialFaceDownCards,
  Players,
  BoardState,
  PlayerBooleans,
} from '../types';

interface GameUpdate {
  updatedPlayers: Players;
  newBoardState: BoardState;
  newFirstMove?: PlayerBooleans;
  nextPlayerTurn: PlayerEnum;
}

export const applyGameUpdate = (dispatch: AppDispatch, update: GameUpdate): void => {
  dispatch(updatePlayers(update.updatedPlayers));
  dispatch(setBoardState(update.newBoardState));
  if (update.newFirstMove !== undefined) dispatch(setFirstMove(update.newFirstMove));
  dispatch(setTurn(update.nextPlayerTurn));
  dispatch(resetUI());
};

export const flipInitialCards = () => (dispatch: AppDispatch, getState: () => RootState) => {
  const { initialFaceDownCards } = getState().game.gameStatus;
  if (initialFaceDownCards[PlayerEnum.PLAYER1] && initialFaceDownCards[PlayerEnum.PLAYER2]) {
    const result = flipInitialCardsLogic(initialFaceDownCards, getState().game.board);
    applyGameUpdate(dispatch, {
      updatedPlayers: getState().game.players,
      newBoardState: result.newBoardState,
      newFirstMove: result.firstMove,
      nextPlayerTurn: result.nextPlayerTurn,
    });
    dispatch(setTieBreaker(result.tieBreaker));
    dispatch(setTieBreakInProgress(result.tieBreaker));
    dispatch(clearInitialFaceDownCards());
    dispatch(setGameOver(isGameOver(getState().game.players)));
  }
};

export const placeCardOnBoard = ({ index, cardIndex }: { index: number; cardIndex: number }) => (
  dispatch: AppDispatch,
  getState: () => RootState
) => {
  const state = getState().game;
  const result = placeCardOnBoardLogic(
    index,
    cardIndex,
    state.turn.currentTurn,
    state.players,
    state.board,
    state.gameStatus.firstMove,
    state.gameStatus.tieBreaker,
    (cards: InitialFaceDownCards) => dispatch(setInitialFaceDownCards(cards))
  );
  applyGameUpdate(dispatch, {
    updatedPlayers: result.updatedPlayers,
    newBoardState: result.newBoardState,
    newFirstMove: result.newFirstMove,
    nextPlayerTurn: result.nextPlayerTurn,
  });
  if (isGameOver(result.updatedPlayers)) dispatch(setGameOver(true));
};

export const discardCard = ({ cardIndex, playerId }: { cardIndex: number; playerId: PlayerEnum }) => (
  dispatch: AppDispatch,
  getState: () => RootState
) => {
  const { players, board, gameStatus } = getState().game;
  if (gameStatus.gameOver || gameStatus.firstMove[playerId]) return;
  const player = players[playerId];
  if (cardIndex < 0 || cardIndex >= player.hand.length) return;
  const cardToDiscard = player.hand[cardIndex];
  if (!cardToDiscard) return;
  dispatch(addDiscardCard({ playerId, card: { ...cardToDiscard, faceDown: true } }));
  const newPlayers = updatePlayerHandAndDrawCard(players, playerId, cardIndex, cardIndex);
  applyGameUpdate(dispatch, {
    updatedPlayers: newPlayers,
    newBoardState: board,
    nextPlayerTurn: getNextPlayerTurn(playerId),
  });
};

export const triggerCardDrag = ({ cardIndex, playerId }: { cardIndex: number; playerId: PlayerEnum }) => (
  dispatch: AppDispatch,
  getState: () => RootState
) => {
  const { board, players, gameStatus, turn } = getState().game;
  const validMoves = handleCardDragLogic(
    cardIndex,
    playerId,
    board,
    players,
    gameStatus.firstMove,
    gameStatus.tieBreaker
  );
  dispatch(setHighlightedCells(validMoves));
  dispatch(setHighlightDiscardPile(turn.currentTurn === playerId && !gameStatus.firstMove[playerId]));
};
