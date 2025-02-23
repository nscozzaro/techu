// src/features/game.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  BoardState,
  Players,
  PlayerEnum,
  Card,
  PlayerBooleans,
  DiscardPiles,
  BOARD_SIZE,
  InitialFaceDownCards,
  ColorEnum,
} from '../types';
import { createDeck, shuffle } from '../logic/deck';
import {
  placeCardOnBoardLogic,
  isGameOver,
  getNextPlayerTurn,
  updatePlayerHandAndDrawCard,
  flipInitialCardsLogic,
  handleCardDragLogic,
  performFirstMoveForPlayer,
  performRegularMoveForPlayer,
} from './gameLogic';

/* ---------- State Initializers ---------- */
const initBoard = (): BoardState =>
  Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => []);

const initPlayer = (color: ColorEnum, id: PlayerEnum) => {
  const deck = createDeck(color, id);
  shuffle(deck);
  return { id, hand: deck.slice(0, 3), deck: deck.slice(3) };
};

const initPlayers = (): Players => ({
  [PlayerEnum.PLAYER1]: initPlayer(ColorEnum.RED, PlayerEnum.PLAYER1),
  [PlayerEnum.PLAYER2]: initPlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2),
});

const initDiscard = (): DiscardPiles => ({
  [PlayerEnum.PLAYER1]: [],
  [PlayerEnum.PLAYER2]: [],
});

const getNextTurn = (current: PlayerEnum): PlayerEnum =>
  current === PlayerEnum.PLAYER1 ? PlayerEnum.PLAYER2 : PlayerEnum.PLAYER1;

const initialTurn = { currentTurn: PlayerEnum.PLAYER1 };
const initialFirstMove: PlayerBooleans = {
  [PlayerEnum.PLAYER1]: true,
  [PlayerEnum.PLAYER2]: true,
};
const initialGameStatus = {
  firstMove: initialFirstMove,
  gameOver: false,
  tieBreaker: false,
  tieBreakInProgress: false,
  initialFaceDownCards: {} as { [key in PlayerEnum]?: Card & { cellIndex: number } },
};

export interface GameState {
  board: BoardState;
  players: Players;
  discard: DiscardPiles;
  turn: typeof initialTurn;
  gameStatus: typeof initialGameStatus;
  highlightedCells: number[];
  draggingPlayer: PlayerEnum | null;
  highlightDiscardPile: boolean;
}

const initialState: GameState = {
  board: initBoard(),
  players: initPlayers(),
  discard: initDiscard(),
  turn: initialTurn,
  gameStatus: initialGameStatus,
  highlightedCells: [],
  draggingPlayer: null,
  highlightDiscardPile: false,
};

/* ---------- Redux Slice ---------- */
const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setBoardState: (state, action: PayloadAction<BoardState>) => {
      state.board = action.payload;
    },
    updatePlayers: (state, action: PayloadAction<Players>) => {
      state.players = action.payload;
    },
    swapCardsInHand: (
      state,
      action: PayloadAction<{ playerId: PlayerEnum; sourceIndex: number; targetIndex: number }>
    ) => {
      const { playerId, sourceIndex, targetIndex } = action.payload;
      const hand = state.players[playerId].hand;
      if (
        sourceIndex >= 0 &&
        sourceIndex < hand.length &&
        targetIndex >= 0 &&
        targetIndex < hand.length
      ) {
        [hand[sourceIndex], hand[targetIndex]] = [hand[targetIndex], hand[sourceIndex]];
      }
    },
    addDiscardCard: (state, action: PayloadAction<{ playerId: PlayerEnum; card: Card }>) => {
      state.discard[action.payload.playerId].push(action.payload.card);
    },
    resetDiscardPiles: (state) => {
      state.discard = initDiscard();
    },
    setFirstMove: (state, action: PayloadAction<PlayerBooleans>) => {
      state.gameStatus.firstMove = action.payload;
    },
    setGameOver: (state, action: PayloadAction<boolean>) => {
      state.gameStatus.gameOver = action.payload;
    },
    setTieBreaker: (state, action: PayloadAction<boolean>) => {
      state.gameStatus.tieBreaker = action.payload;
    },
    setTieBreakInProgress: (state, action: PayloadAction<boolean>) => {
      state.gameStatus.tieBreakInProgress = action.payload;
    },
    setInitialFaceDownCards: (
      state,
      action: PayloadAction<{ [key in PlayerEnum]?: Card & { cellIndex: number } }>
    ) => {
      state.gameStatus.initialFaceDownCards = {
        ...state.gameStatus.initialFaceDownCards,
        ...action.payload,
      };
    },
    clearInitialFaceDownCards: (state) => {
      state.gameStatus.initialFaceDownCards = {};
    },
    setTurn: (state, action: PayloadAction<PlayerEnum>) => {
      state.turn.currentTurn = action.payload;
    },
    nextTurn: (state) => {
      state.turn.currentTurn = getNextTurn(state.turn.currentTurn);
    },
    setHighlightedCells: (state, action: PayloadAction<number[]>) => {
      state.highlightedCells = action.payload;
    },
    setDraggingPlayer: (state, action: PayloadAction<PlayerEnum | null>) => {
      state.draggingPlayer = action.payload;
    },
    setHighlightDiscardPile: (state, action: PayloadAction<boolean>) => {
      state.highlightDiscardPile = action.payload;
    },
    resetUI: (state) => {
      state.highlightedCells = [];
      state.draggingPlayer = null;
      state.highlightDiscardPile = false;
    },
  },
});

export const {
  setBoardState,
  updatePlayers,
  swapCardsInHand,
  addDiscardCard,
  resetDiscardPiles,
  setFirstMove,
  setGameOver,
  setTieBreaker,
  setTieBreakInProgress,
  setInitialFaceDownCards,
  clearInitialFaceDownCards,
  setTurn,
  nextTurn,
  setHighlightedCells,
  setDraggingPlayer,
  setHighlightDiscardPile,
  resetUI,
} = gameSlice.actions;

/* ---------- Thunk Actions (Combined) ---------- */
export const applyGameUpdate = (
  dispatch: any,
  update: {
    updatedPlayers: Players;
    newBoardState: BoardState;
    newFirstMove?: PlayerBooleans;
    nextPlayerTurn: PlayerEnum;
  }
): void => {
  dispatch(updatePlayers(update.updatedPlayers));
  dispatch(setBoardState(update.newBoardState));
  if (update.newFirstMove !== undefined) dispatch(setFirstMove(update.newFirstMove));
  dispatch(setTurn(update.nextPlayerTurn));
  dispatch(resetUI());
};

export const flipInitialCards = () => (dispatch: any, getState: any) => {
  const { initialFaceDownCards } = getState().game.gameStatus;
  if (initialFaceDownCards[PlayerEnum.PLAYER1] && initialFaceDownCards[PlayerEnum.PLAYER2]) {
    dispatch(setHighlightedCells([]));
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
  dispatch: any,
  getState: any
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
  dispatch: any,
  getState: any
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
  dispatch: any,
  getState: any
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

export const playTurn = (playerId: PlayerEnum) => (dispatch: any, getState: any) => {
  const state = getState().game;
  if (state.gameStatus.firstMove[playerId]) performFirstMove(dispatch, state, playerId);
  else performRegularTurn(dispatch, state, playerId);
};

const performFirstMove = (dispatch: any, game: GameState, playerId: PlayerEnum) => {
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

const performRegularTurn = (dispatch: any, game: GameState, playerId: PlayerEnum) => {
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
      const idx = game.players[playerId].hand.findIndex((c) => c !== null);
      if (idx !== -1) dispatch(discardCard({ cardIndex: idx, playerId }));
    }
  }
};

export default gameSlice.reducer;
