import { RootState } from '../store';
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
  setHighlightedCells,
  setHighlightDiscardPile,
} from './gameSlice';
import { PlayerEnum, InitialFaceDownCards } from '../types';

export const flipInitialCards = () => (dispatch: any, getState: () => RootState) => {
  const { initialFaceDownCards } = getState().game.gameStatus;
  if (initialFaceDownCards[PlayerEnum.PLAYER1] && initialFaceDownCards[PlayerEnum.PLAYER2]) {
    const result = flipInitialCardsLogic(initialFaceDownCards, getState().game.board);
    dispatch(setBoardState(result.newBoardState));
    dispatch(setTieBreaker(result.tieBreaker));
    dispatch(setTieBreakInProgress(result.tieBreaker));
    dispatch(setTurn(result.nextPlayerTurn));
    dispatch(setGameOver(isGameOver(getState().game.players)));
    dispatch(clearInitialFaceDownCards());
    dispatch(setFirstMove(result.firstMove));
    dispatch(setHighlightedCells([]));
  }
};

export const placeCardOnBoard = ({ index, cardIndex }: { index: number; cardIndex: number }) => (
  dispatch: any,
  getState: () => RootState
) => {
  const state = getState();
  const { players, board } = state.game;
  const { firstMove, tieBreaker } = state.game.gameStatus;
  const currentPlayer = state.game.turn.currentTurn;

  const result = placeCardOnBoardLogic(
    index,
    cardIndex,
    currentPlayer,
    players,
    board,
    firstMove,
    tieBreaker,
    (cards: InitialFaceDownCards) => dispatch(setInitialFaceDownCards(cards))
  );
  dispatch(updatePlayers(result.updatedPlayers));
  dispatch(setBoardState(result.newBoardState));
  dispatch(setFirstMove(result.newFirstMove));
  dispatch(setTurn(result.nextPlayerTurn));
  if (isGameOver(result.updatedPlayers)) dispatch(setGameOver(true));
  dispatch(setHighlightedCells([]));
  dispatch(setHighlightDiscardPile(false));
};

export const discardCard = ({ cardIndex, playerId }: { cardIndex: number; playerId: PlayerEnum }) => (
  dispatch: any,
  getState: () => RootState
) => {
  const state = getState();
  const { players } = state.game;
  const { gameOver, firstMove } = state.game.gameStatus;
  if (gameOver || firstMove[playerId]) return;
  const updatedPlayers = { ...players };
  const player = updatedPlayers[playerId];
  if (cardIndex < 0 || cardIndex >= player.hand.length) return;
  const cardToDiscard = player.hand[cardIndex];
  if (!cardToDiscard) return;
  const discardedCard = { ...cardToDiscard, faceDown: true };
  dispatch(addDiscardCard({ playerId, card: discardedCard }));
  const newPlayers = updatePlayerHandAndDrawCard(updatedPlayers, playerId, cardIndex, cardIndex);
  dispatch(updatePlayers(newPlayers));
  dispatch(setTurn(getNextPlayerTurn(playerId)));
  dispatch(setHighlightedCells([]));
  dispatch(setHighlightDiscardPile(false));
};

export const triggerCardDrag = ({ cardIndex, playerId }: { cardIndex: number; playerId: PlayerEnum }) => (
  dispatch: any,
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
  if (turn.currentTurn === playerId)
    dispatch(setHighlightDiscardPile(!gameStatus.firstMove[playerId]));
  else dispatch(setHighlightDiscardPile(false));
};
