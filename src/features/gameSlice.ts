// src/features/gameSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  BoardState,
  Players,
  PlayerEnum,
  Card,
  PlayerBooleans,
  DiscardPiles,
  BOARD_SIZE,
} from '../types';
import { createDeck, shuffle } from '../logic/deck';
import { ColorEnum } from '../types';

// Initialize an empty board.
const initBoard = (): BoardState =>
  Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => []);

// Create a player by shuffling a deck and splitting it into hand and deck.
const initPlayer = (color: ColorEnum, id: PlayerEnum) => {
  const deck = createDeck(color, id);
  shuffle(deck);
  return { id, hand: deck.slice(0, 3), deck: deck.slice(3) };
};

// Consolidate players into one object.
const initPlayers = (): Players => ({
  [PlayerEnum.PLAYER1]: initPlayer(ColorEnum.RED, PlayerEnum.PLAYER1),
  [PlayerEnum.PLAYER2]: initPlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2),
});

// Initialize empty discard piles.
const initDiscard = (): DiscardPiles => ({
  [PlayerEnum.PLAYER1]: [],
  [PlayerEnum.PLAYER2]: [],
});

// Get the next turn based on the current player.
const getNextTurn = (current: PlayerEnum): PlayerEnum =>
  current === PlayerEnum.PLAYER1 ? PlayerEnum.PLAYER2 : PlayerEnum.PLAYER1;

// Initial state slices.
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

// Define the complete game state.
export interface GameState {
  board: BoardState;
  players: Players;
  discard: DiscardPiles;
  turn: typeof initialTurn;
  gameStatus: typeof initialGameStatus;
}

const initialState: GameState = {
  board: initBoard(),
  players: initPlayers(),
  discard: initDiscard(),
  turn: initialTurn,
  gameStatus: initialGameStatus,
};

// Create the game slice with short, modular reducers.
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
      action: PayloadAction<{
        playerId: PlayerEnum;
        sourceIndex: number;
        targetIndex: number;
      }>
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
    addDiscardCard: (
      state,
      action: PayloadAction<{ playerId: PlayerEnum; card: Card }>
    ) => {
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
} = gameSlice.actions;
export default gameSlice.reducer;
