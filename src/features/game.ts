// src/features/game.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState, AppDispatch } from '../store';
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
  Move,
  Scores,
  initialFirstMove,
  STARTING_INDICES,
  CardIndex,
  FaceDownCard,
  // Removed Player as it is not used.
  rankOrder,
} from '../types';
import {
  createDeck,
  shuffle,
  getValidMoves,
  calculateValidMoves,
} from '../logic/logic';

/* ---------- Pure Helper Functions ---------- */
const drawCard = (
  hand: (Card | null)[],
  deck: (Card | null)[]
): { hand: (Card | null)[]; deck: (Card | null)[] } => {
  if (deck.length === 0) return { hand, deck };
  const card = deck[deck.length - 1]!;
  const newDeck = deck.slice(0, deck.length - 1);
  const newHand = [...hand];
  const firstEmpty = newHand.findIndex((c) => c === null);
  if (firstEmpty !== -1) newHand[firstEmpty] = card;
  else newHand.push(card);
  return { hand: newHand, deck: newDeck };
};

export const updatePlayerHandAndDrawCard = (
  players: Players,
  playerId: PlayerEnum,
  cardIndex: CardIndex
): Players => {
  const player = players[playerId];
  const newHand = [...player.hand];
  newHand[cardIndex] = null;
  const result = drawCard(newHand, [...player.deck]);
  return {
    ...players,
    [playerId]: { ...player, hand: result.hand, deck: result.deck },
  };
};

export const initializePlayer = (color: ColorEnum, id: PlayerEnum) => {
  const deck = createDeck(color, id);
  shuffle(deck);
  return { id, hand: deck.slice(0, 3), deck: deck.slice(3) };
};

export const initialPlayers = (): Players => ({
  [PlayerEnum.PLAYER1]: initializePlayer(ColorEnum.RED, PlayerEnum.PLAYER1),
  [PlayerEnum.PLAYER2]: initializePlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2),
});

export const initialBoardState = (): BoardState =>
  Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => []);

export const initialScores = (): Scores => ({
  [PlayerEnum.PLAYER1]: 0,
  [PlayerEnum.PLAYER2]: 0,
});

export const initialDiscardPiles = (): DiscardPiles => ({
  [PlayerEnum.PLAYER1]: [],
  [PlayerEnum.PLAYER2]: [],
});

export const getNextPlayerTurn = (current: PlayerEnum): PlayerEnum =>
  current === PlayerEnum.PLAYER1 ? PlayerEnum.PLAYER2 : PlayerEnum.PLAYER1;

export const isGameOver = (players: Players): boolean =>
  Object.values(players).every(
    (player) =>
      player.hand.every((card) => card === null) && player.deck.length === 0
  );

/* ---------- Helper: select a random move from list ---------- */
const selectRandomMove = (moves: Move[]): Move | null =>
  moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;

/* ---------- New Helper: update board cell ---------- */
const updateBoardCell = (
  board: BoardState,
  cellIndex: CardIndex,
  card: Card
): BoardState =>
  board.map((cell, idx) =>
    idx === cellIndex ? [...cell, card] : cell
  );

/* ---------- Helper: Apply a move to board state ---------- */
const applyMoveToBoardState = (
  boardState: BoardState,
  players: Players,
  move: Move,
  playerId: PlayerEnum
): { newBoardState: BoardState; updatedPlayers: Players } => {
  if (move.type !== 'board' || move.cellIndex === undefined) {
    return { newBoardState: boardState, updatedPlayers: players };
  }
  const newBoardState = boardState.map((cell, idx) =>
    idx === move.cellIndex
      ? [...cell, players[playerId].hand[move.cardIndex]!]
      : cell
  );
  const updatedPlayers = updatePlayerHandAndDrawCard(
    players,
    playerId,
    move.cardIndex
  );
  return { newBoardState, updatedPlayers };
};

/* ---------- New Helper: Handle First Move ---------- */
const handleFirstMove = (
  players: Players,
  playerId: PlayerEnum,
  boardState: BoardState,
  card: NonNullable<Card>,
  tieBreaker: boolean,
  setInitialFaceDownCards: (cards: InitialFaceDownCards) => void
): { updatedPlayers: Players; newBoardState: BoardState } => {
  const shouldFaceDown = !tieBreaker;
  const updatedPlayers = updatePlayerHandAndDrawCard(players, playerId, 0);
  const validMoves = getValidMoves(
    players[playerId].hand,
    playerId,
    boardState,
    BOARD_SIZE,
    true,
    STARTING_INDICES,
    tieBreaker
  );
  let newBoard = [...boardState];
  const move = selectRandomMove(validMoves);
  if (move && move.cellIndex !== undefined) {
    const cardToPlace = { ...card, faceDown: shouldFaceDown };
    setInitialFaceDownCards({
      [playerId]: { ...cardToPlace, cellIndex: move.cellIndex },
    });
    newBoard = updateBoardCell(newBoard, move.cellIndex, cardToPlace);
  }
  return { updatedPlayers, newBoardState: newBoard };
};

/* ---------- First Move Handler ---------- */
export const performFirstMoveForPlayer = (
  players: Players,
  playerId: PlayerEnum,
  boardState: BoardState,
  tieBreaker: boolean,
  setInitialFaceDownCards: (cards: InitialFaceDownCards) => void
): {
  updatedPlayers: Players;
  newBoardState: BoardState;
  newFirstMove: PlayerBooleans;
  nextPlayerTurn: PlayerEnum;
} => {
  const card = players[playerId].hand[0];
  if (!card) {
    return {
      updatedPlayers: players,
      newBoardState: boardState,
      newFirstMove: initialFirstMove(),
      nextPlayerTurn: getNextPlayerTurn(playerId),
    };
  }
  const { updatedPlayers, newBoardState } = handleFirstMove(
    players,
    playerId,
    boardState,
    card,
    tieBreaker,
    setInitialFaceDownCards
  );
  return {
    updatedPlayers,
    newBoardState,
    newFirstMove: { ...initialFirstMove(), [playerId]: tieBreaker },
    nextPlayerTurn: getNextPlayerTurn(playerId),
  };
};

export const performRegularMoveForPlayer = (
  players: Players,
  playerId: PlayerEnum,
  boardState: BoardState
): {
  updatedPlayers: Players;
  newBoardState: BoardState;
  nextPlayerTurn: PlayerEnum;
  moveMade: boolean;
  move?: Move;
} => {
  const validMoves = getValidMoves(
    players[playerId].hand,
    playerId,
    boardState,
    BOARD_SIZE,
    false,
    STARTING_INDICES,
    false
  );
  let newBoard = [...boardState];
  let updatedPlayers = { ...players };
  let moveMade = false;
  const selectedMove: Move | undefined = selectRandomMove(validMoves) || undefined;
  if (selectedMove) {
    if (selectedMove.type === 'board') {
      const result = applyMoveToBoardState(boardState, players, selectedMove, playerId);
      newBoard = result.newBoardState;
      updatedPlayers = result.updatedPlayers;
      moveMade = true;
    } else if (selectedMove.type === 'discard') {
      moveMade = true;
    }
  }
  return {
    updatedPlayers,
    newBoardState: newBoard,
    nextPlayerTurn: getNextPlayerTurn(playerId),
    moveMade,
    move: selectedMove,
  };
};

export const handleCardDragLogic = (
  cardIndex: CardIndex,
  playerId: PlayerEnum,
  boardState: BoardState,
  players: Players,
  firstMove: { [key in PlayerEnum]: boolean },
  tieBreaker: boolean
): number[] =>
  calculateValidMoves(
    cardIndex,
    playerId,
    boardState,
    BOARD_SIZE,
    firstMove[playerId],
    players[playerId].hand,
    STARTING_INDICES,
    tieBreaker
  );

/* ---------- UI Helper: Reset UI state ---------- */
const resetUIState = (state: GameState): GameState => {
  state.highlightedCells = [];
  state.draggingPlayer = null;
  state.highlightDiscardPile = false;
  return state;
};

/* ---------- New Helpers for Flipping Initial Cards ---------- */
const flipCardsInBoard = (
  initialFaceDownCards: InitialFaceDownCards,
  boardState: BoardState
): BoardState => {
  const newBoardState = boardState.map((cell) => [...cell]);
  Object.entries(initialFaceDownCards).forEach(([player, cardData]) => {
    if (cardData) {
      const cellIndex = cardData.cellIndex;
      const lastCardIndex = newBoardState[cellIndex].length - 1;
      const lastCard = newBoardState[cellIndex][lastCardIndex];
      if (lastCard !== null) {
        newBoardState[cellIndex][lastCardIndex] = {
          ...lastCard,
          faceDown: false,
        };
      }
    }
  });
  return newBoardState;
};

const determineTurnAndTieBreaker = (
  initialFaceDownCards: InitialFaceDownCards
): {
  nextPlayerTurn: PlayerEnum;
  tieBreaker: boolean;
  firstMove: { [key in PlayerEnum]: boolean };
} => {
  const card1 = initialFaceDownCards[PlayerEnum.PLAYER1];
  const card2 = initialFaceDownCards[PlayerEnum.PLAYER2];
  const rank1 = card1 ? rankOrder[card1.rank] : -1;
  const rank2 = card2 ? rankOrder[card2.rank] : -1;
  if (rank1 === rank2) {
    return {
      nextPlayerTurn: PlayerEnum.PLAYER1,
      tieBreaker: true,
      firstMove: initialFirstMove(),
    };
  } else {
    return {
      nextPlayerTurn: rank1 < rank2 ? PlayerEnum.PLAYER1 : PlayerEnum.PLAYER2,
      tieBreaker: false,
      firstMove: { [PlayerEnum.PLAYER1]: false, [PlayerEnum.PLAYER2]: false },
    };
  }
};

export const flipInitialCardsLogic = (
  initialFaceDownCards: InitialFaceDownCards,
  boardState: BoardState
): {
  newBoardState: BoardState;
  nextPlayerTurn: PlayerEnum;
  tieBreaker: boolean;
  firstMove: { [key in PlayerEnum]: boolean };
} => {
  if (
    !initialFaceDownCards[PlayerEnum.PLAYER1] ||
    !initialFaceDownCards[PlayerEnum.PLAYER2]
  ) {
    return {
      newBoardState: boardState,
      nextPlayerTurn: getNextPlayerTurn(PlayerEnum.PLAYER1),
      tieBreaker: false,
      firstMove: {
        [PlayerEnum.PLAYER1]: false,
        [PlayerEnum.PLAYER2]: false,
      },
    };
  }
  const newBoardState = flipCardsInBoard(initialFaceDownCards, boardState);
  const { nextPlayerTurn, tieBreaker, firstMove } =
    determineTurnAndTieBreaker(initialFaceDownCards);
  return { newBoardState, nextPlayerTurn, tieBreaker, firstMove };
};

/* ---------- Exported Pure Function: Calculate Scores ---------- */
export const calculateScores = (boardState: BoardState): Scores =>
  boardState.reduce((scores, cellStack) => {
    if (cellStack.length > 0) {
      const topCard = cellStack[cellStack.length - 1];
      if (topCard?.color === ColorEnum.RED) scores[PlayerEnum.PLAYER1]++;
      else if (topCard?.color === ColorEnum.BLACK) scores[PlayerEnum.PLAYER2]++;
    }
    return scores;
  }, { [PlayerEnum.PLAYER1]: 0, [PlayerEnum.PLAYER2]: 0 } as Scores);

/* ---------- Redux Slice ---------- */
export interface GameState {
  board: BoardState;
  players: Players;
  discard: DiscardPiles;
  turn: { currentTurn: PlayerEnum };
  gameStatus: {
    firstMove: PlayerBooleans;
    gameOver: boolean;
    tieBreaker: boolean;
    initialFaceDownCards: { [key in PlayerEnum]?: FaceDownCard };
  };
  highlightedCells: number[];
  draggingPlayer: PlayerEnum | null;
  highlightDiscardPile: boolean;
}

const initialState: GameState = {
  board: initialBoardState(),
  players: initialPlayers(),
  discard: initialDiscardPiles(),
  turn: { currentTurn: PlayerEnum.PLAYER1 },
  gameStatus: {
    firstMove: initialFirstMove(),
    gameOver: false,
    tieBreaker: false,
    initialFaceDownCards: {},
  },
  highlightedCells: [],
  draggingPlayer: null,
  highlightDiscardPile: false,
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
    addDiscardCard: (
      state,
      action: PayloadAction<{ playerId: PlayerEnum; card: Card }>
    ) => {
      state.discard[action.payload.playerId].push(action.payload.card);
    },
    resetDiscardPiles: (state) => {
      state.discard = initialDiscardPiles();
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
    setInitialFaceDownCards: (
      state,
      action: PayloadAction<{
        [key in PlayerEnum]?: Card & { cellIndex: CardIndex };
      }>
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
      state.turn.currentTurn = getNextPlayerTurn(state.turn.currentTurn);
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
    resetUI: (state) => resetUIState(state),
    updateGame: (state, action: PayloadAction<Partial<GameState>>) => {
      for (const key in action.payload) {
        (state as any)[key] = action.payload[key as keyof GameState];
      }
    },
    pushCardToBoard: (
      state,
      action: PayloadAction<{ cellIndex: CardIndex; card: Card }>
    ) => {
      state.board[action.payload.cellIndex].push(action.payload.card);
    },
    moveCard: (
      state,
      action: PayloadAction<{
        cardIndex: CardIndex;
        playerId: PlayerEnum;
        destination: 'discard' | 'board' | 'hand';
        boardIndex?: number;
        handIndex?: number;
      }>
    ) => {
      if (state.gameStatus.gameOver) return;
      const { cardIndex, playerId, destination, boardIndex, handIndex } = action.payload;
      const player = state.players[playerId];
      const cardToMove = player.hand[cardIndex];
      if (!cardToMove) {
        state.turn.currentTurn = getNextPlayerTurn(playerId);
        return;
      }
      const actions: { [key in 'discard' | 'board' | 'hand']: () => void } = {
        discard: () => {
          if (state.gameStatus.firstMove[playerId]) return;
          state.discard[playerId].push({ ...cardToMove, faceDown: true });
          player.hand[cardIndex] = null;
          {
            const result = drawCard(player.hand, player.deck);
            player.hand = result.hand;
            player.deck = result.deck;
          }
          state.turn.currentTurn = getNextPlayerTurn(playerId);
        },
        board: () => {
          if (boardIndex === undefined) return;
          const isFirst = state.gameStatus.firstMove[playerId];
          const tieBreaker = state.gameStatus.tieBreaker;
          const cardCopy =
            isFirst && !tieBreaker
              ? { ...cardToMove, faceDown: true }
              : { ...cardToMove, faceDown: false };
          if (isFirst || tieBreaker) {
            state.gameStatus.initialFaceDownCards[playerId] = { ...cardCopy, cellIndex: boardIndex };
          }
          state.board[boardIndex].push(cardCopy);
          player.hand[cardIndex] = null;
          {
            const result = drawCard(player.hand, player.deck);
            player.hand = result.hand;
            player.deck = result.deck;
          }
          state.gameStatus.firstMove[playerId] = false;
          state.turn.currentTurn = getNextPlayerTurn(playerId);
        },
        hand: () => {
          if (handIndex === undefined) return;
          [player.hand[cardIndex], player.hand[handIndex]] = [
            player.hand[handIndex],
            player.hand[cardIndex],
          ];
        },
      };
      actions[destination]?.();
      if (isGameOver(state.players)) {
        state.gameStatus.gameOver = true;
      }
      resetUIState(state);
    },
  },
});

export const {
  setBoardState,
  updatePlayers,
  addDiscardCard,
  resetDiscardPiles,
  setFirstMove,
  setGameOver,
  setTieBreaker,
  setInitialFaceDownCards,
  clearInitialFaceDownCards,
  setTurn,
  nextTurn,
  setHighlightedCells,
  setDraggingPlayer,
  setHighlightDiscardPile,
  resetUI,
  updateGame,
  pushCardToBoard,
  moveCard,
} = gameSlice.actions;

export default gameSlice.reducer;

/* ---------- Thunk Actions ---------- */
export const performPlayerTurn =
  (playerId: PlayerEnum) => (dispatch: AppDispatch, getState: () => RootState) => {
    const game = getState().game;
    const isFirst = game.gameStatus.firstMove[playerId];
    if (isFirst) {
      const result = performFirstMoveForPlayer(
        game.players,
        playerId,
        game.board,
        game.gameStatus.tieBreaker,
        (cards: InitialFaceDownCards) => dispatch(setInitialFaceDownCards(cards))
      );
      applyGameUpdate(dispatch, getState, {
        updatedPlayers: result.updatedPlayers,
        newBoardState: result.newBoardState,
        newFirstMove: result.newFirstMove,
        nextPlayerTurn: result.nextPlayerTurn,
      });
    } else {
      const result = performRegularMoveForPlayer(
        game.players,
        playerId,
        game.board
      );
      applyGameUpdate(dispatch, getState, {
        updatedPlayers: result.updatedPlayers,
        newBoardState: result.newBoardState,
        nextPlayerTurn: result.nextPlayerTurn,
      });
      if (playerId === PlayerEnum.PLAYER2 && result.move?.type === 'discard') {
        dispatch(
          moveCard({
            cardIndex: result.move.cardIndex,
            playerId,
            destination: 'discard',
          })
        );
      }
    }
  };

export const playTurn =
  (playerId: PlayerEnum) => (dispatch: AppDispatch) => {
    dispatch(performPlayerTurn(playerId));
  };

export const applyGameUpdate = (
  dispatch: AppDispatch,
  getState: () => RootState,
  update: {
    updatedPlayers: Players;
    newBoardState: BoardState;
    newFirstMove?: PlayerBooleans;
    nextPlayerTurn: PlayerEnum;
  }
): void => {
  const currentGameStatus = getState().game.gameStatus;
  dispatch(
    updateGame({
      players: update.updatedPlayers,
      board: update.newBoardState,
      turn: { currentTurn: update.nextPlayerTurn },
      gameStatus:
        update.newFirstMove !== undefined
          ? { ...currentGameStatus, firstMove: update.newFirstMove }
          : currentGameStatus,
      highlightedCells: [],
      draggingPlayer: null,
      highlightDiscardPile: false,
    })
  );
};

export const flipInitialCards =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const { initialFaceDownCards } = getState().game.gameStatus;
    if (
      initialFaceDownCards[PlayerEnum.PLAYER1] &&
      initialFaceDownCards[PlayerEnum.PLAYER2]
    ) {
      const state = getState().game;
      const result = flipInitialCardsLogic(initialFaceDownCards, state.board);
      dispatch(
        updateGame({
          players: state.players,
          board: result.newBoardState,
          turn: { currentTurn: result.nextPlayerTurn },
          gameStatus: {
            ...state.gameStatus,
            firstMove: result.firstMove,
            tieBreaker: result.tieBreaker,
            initialFaceDownCards: {},
            gameOver: isGameOver(state.players),
          },
          highlightedCells: [],
          draggingPlayer: null,
          highlightDiscardPile: false,
        })
      );
    }
  };

export const triggerCardDrag =
  ({
    cardIndex,
    playerId,
  }: {
    cardIndex: CardIndex;
    playerId: PlayerEnum;
  }) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
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
    dispatch(
      setHighlightDiscardPile(
        turn.currentTurn === playerId && !gameStatus.firstMove[playerId]
      )
    );
  };
