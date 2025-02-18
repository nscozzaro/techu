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
  initialFirstMove,
} from '../types';
import { createDeck, shuffle } from '../logic/deck';
import { ColorEnum } from '../types';

// --- Initialize Board ---
const initialBoard: BoardState = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => []);

// --- Initialize Players ---
const initializePlayer = (color: ColorEnum, id: PlayerEnum) => {
  const deck = createDeck(color, id);
  shuffle(deck);
  return { id, hand: deck.slice(0, 3), deck: deck.slice(3) };
};
const initialPlayers: Players = {
  [PlayerEnum.PLAYER1]: initializePlayer(ColorEnum.RED, PlayerEnum.PLAYER1),
  [PlayerEnum.PLAYER2]: initializePlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2),
};

// --- Initialize Discard Piles ---
const initialDiscard: DiscardPiles = {
  [PlayerEnum.PLAYER1]: [],
  [PlayerEnum.PLAYER2]: [],
};

// --- Initialize Turn ---
const initialTurn = { currentTurn: PlayerEnum.PLAYER1 };

// --- Initialize Game Status ---
const initialGameStatus = {
  firstMove: initialFirstMove(),
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
}

const initialState: GameState = {
  board: initialBoard,
  players: initialPlayers,
  discard: initialDiscard,
  turn: initialTurn,
  gameStatus: initialGameStatus,
};

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
      const player = state.players[playerId];
      if (
        sourceIndex < 0 ||
        sourceIndex >= player.hand.length ||
        targetIndex < 0 ||
        targetIndex >= player.hand.length
      ) {
        return;
      }
      [player.hand[sourceIndex], player.hand[targetIndex]] = [
        player.hand[targetIndex],
        player.hand[sourceIndex],
      ];
    },
    addDiscardCard: (state, action: PayloadAction<{ playerId: PlayerEnum; card: Card }>) => {
      state.discard[action.payload.playerId].push(action.payload.card);
    },
    resetDiscardPiles: (state) => {
      state.discard = initialDiscard;
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
      state.turn.currentTurn =
        state.turn.currentTurn === PlayerEnum.PLAYER1 ? PlayerEnum.PLAYER2 : PlayerEnum.PLAYER1;
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
