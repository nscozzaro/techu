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
  Move,
  Scores,
  rankOrder,
  initialFirstMove,
  STARTING_INDICES,
} from '../types';
import {
  createDeck,
  shuffle,
  getValidMoves,
  calculateValidMoves,
} from '../logic/logic';

/* ---------- Helper Functions ---------- */
const drawCard = (
  hand: (Card | null)[],
  deck: (Card | null)[]
): { hand: (Card | null)[]; deck: (Card | null)[] } => {
  if (deck.length === 0) return { hand, deck };
  const card = deck.pop()!;
  const newHand = [...hand];
  const firstEmpty = newHand.findIndex(c => c === null);
  if (firstEmpty !== -1) newHand[firstEmpty] = card;
  else newHand.push(card);
  return { hand: newHand, deck };
};

export const updatePlayerHandAndDrawCard = (
  players: Players,
  playerId: PlayerEnum,
  cardIndex: number,
  insertSlot?: number
): Players => {
  const player = players[playerId];
  const newHand = [...player.hand];
  newHand[cardIndex] = null;
  const result = drawCard(newHand, [...player.deck]);
  return { ...players, [playerId]: { ...player, hand: result.hand, deck: result.deck } };
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
    player => player.hand.every(card => card === null) && player.deck.length === 0
  );

// (Removed cloneBoardState since board updates will now be handled by Redux)

/* ---------- Helper: select a random move from list ---------- */
const selectRandomMove = (moves: Move[]): Move | null =>
  moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;

/* ---------- New Helper: update board cell ---------- */
const updateBoardCell = (board: BoardState, cellIndex: number, card: Card): BoardState =>
  board.map((cell, idx) => (idx === cellIndex ? [...cell, card] : cell));

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
    idx === move.cellIndex ? [...cell, players[playerId].hand[move.cardIndex]!] : cell
  );
  const updatedPlayers = updatePlayerHandAndDrawCard(players, playerId, move.cardIndex, move.cardIndex);
  return { newBoardState, updatedPlayers };
};

/* ---------- First Move Handlers ---------- */
const handleFirstMoveTieBreaker = (
  players: Players,
  playerId: PlayerEnum,
  boardState: BoardState,
  card: NonNullable<Card>,
  setInitialFaceDownCards: (cards: InitialFaceDownCards) => void
): { newBoardState: BoardState; updatedPlayers: Players } => {
  const validMoves = getValidMoves(
    players[playerId].hand,
    playerId,
    boardState,
    BOARD_SIZE,
    true,
    STARTING_INDICES,
    true
  );
  let newBoard = [...boardState];
  let updatedPlayers = players;
  const move = selectRandomMove(validMoves);
  if (move && move.cellIndex !== undefined) {
    newBoard[move.cellIndex] = [...newBoard[move.cellIndex], { ...card, faceDown: false }];
    setInitialFaceDownCards({ [playerId]: { ...card, faceDown: false, cellIndex: move.cellIndex } });
    updatedPlayers = updatePlayerHandAndDrawCard(players, playerId, 0, 0);
  }
  return { newBoardState: newBoard, updatedPlayers };
};

const handleFirstMoveNormal = (
  players: Players,
  playerId: PlayerEnum,
  boardState: BoardState,
  card: NonNullable<Card>,
  setInitialFaceDownCards: (cards: InitialFaceDownCards) => void
): { updatedPlayers: Players; newBoardState: BoardState } => {
  // In a normal first move, the card is initially placed face down.
  const faceDownCard = { ...card, faceDown: true };
  const updatedPlayers = updatePlayerHandAndDrawCard(players, playerId, 0, 0);
  const validMoves = getValidMoves(
    players[playerId].hand,
    playerId,
    boardState,
    BOARD_SIZE,
    true,
    STARTING_INDICES,
    false
  );
  let newBoard = [...boardState];
  const move = selectRandomMove(validMoves);
  if (move && move.type === 'board' && move.cellIndex !== undefined) {
    setInitialFaceDownCards({ [playerId]: { ...faceDownCard, cellIndex: move.cellIndex } });
    newBoard[move.cellIndex] = [...newBoard[move.cellIndex], faceDownCard];
  }
  return { updatedPlayers, newBoardState: newBoard };
};

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
  if (tieBreaker) {
    const { newBoardState, updatedPlayers } = handleFirstMoveTieBreaker(
      players,
      playerId,
      boardState,
      card,
      setInitialFaceDownCards
    );
    return {
      updatedPlayers,
      newBoardState,
      newFirstMove: { ...initialFirstMove(), [playerId]: true },
      nextPlayerTurn: getNextPlayerTurn(playerId),
    };
  } else {
    const { updatedPlayers, newBoardState } = handleFirstMoveNormal(
      players,
      playerId,
      boardState,
      card,
      setInitialFaceDownCards
    );
    return {
      updatedPlayers,
      newBoardState,
      newFirstMove: { ...initialFirstMove(), [playerId]: false },
      nextPlayerTurn: getNextPlayerTurn(playerId),
    };
  }
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
  let selectedMove: Move | undefined = selectRandomMove(validMoves) || undefined;
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
  cardIndex: number,
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

/* ---------- UI Helpers ---------- */
// Updated flipCardsInBoard: iterate over all entries in initialFaceDownCards
const flipCardsInBoard = (
  initialFaceDownCards: InitialFaceDownCards,
  boardState: BoardState
): BoardState => {
  let newBoardState = boardState.map(cell => [...cell]);
  Object.entries(initialFaceDownCards).forEach(([player, cardData]) => {
    if (cardData) {
      const cellIndex = cardData.cellIndex;
      const lastCardIndex = newBoardState[cellIndex].length - 1;
      const lastCard = newBoardState[cellIndex][lastCardIndex];
      if (lastCard !== null) {
        newBoardState[cellIndex][lastCardIndex] = { ...lastCard, faceDown: false };
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
  if (!initialFaceDownCards[PlayerEnum.PLAYER1] || !initialFaceDownCards[PlayerEnum.PLAYER2]) {
    return {
      newBoardState: boardState,
      nextPlayerTurn: getNextPlayerTurn(PlayerEnum.PLAYER1),
      tieBreaker: false,
      firstMove: { [PlayerEnum.PLAYER1]: false, [PlayerEnum.PLAYER2]: false },
    };
  }
  const newBoardState = flipCardsInBoard(initialFaceDownCards, boardState);
  const { nextPlayerTurn, tieBreaker, firstMove } = determineTurnAndTieBreaker(initialFaceDownCards);
  return { newBoardState, nextPlayerTurn, tieBreaker, firstMove };
};

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
    tieBreakInProgress: boolean;
    initialFaceDownCards: { [key in PlayerEnum]?: Card & { cellIndex: number } };
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
    tieBreakInProgress: false,
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
    swapCardsInHand: (
      state,
      action: PayloadAction<{ playerId: PlayerEnum; sourceIndex: number; targetIndex: number }>
    ) => {
      const { playerId, sourceIndex, targetIndex } = action.payload;
      const hand = state.players[playerId].hand;
      if (sourceIndex >= 0 && sourceIndex < hand.length && targetIndex >= 0 && targetIndex < hand.length) {
        [hand[sourceIndex], hand[targetIndex]] = [hand[targetIndex], hand[sourceIndex]];
      }
    },
    addDiscardCard: (state, action: PayloadAction<{ playerId: PlayerEnum; card: Card }>) => {
      state.discard[action.payload.playerId].push(action.payload.card);
    },
    resetDiscardPiles: state => {
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
    clearInitialFaceDownCards: state => {
      state.gameStatus.initialFaceDownCards = {};
    },
    setTurn: (state, action: PayloadAction<PlayerEnum>) => {
      state.turn.currentTurn = action.payload;
    },
    nextTurn: state => {
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
    resetUI: state => {
      state.highlightedCells = [];
      state.draggingPlayer = null;
      state.highlightDiscardPile = false;
    },
    // New reducer that lets us update several parts of the state at once.
    updateGame: (state, action: PayloadAction<Partial<GameState>>) => {
      for (const key in action.payload) {
        (state as any)[key] = action.payload[key as keyof GameState];
      }
    },
    // New reducer action that pushes a card to a board cell without manual cloning:
    pushCardToBoard: (
      state,
      action: PayloadAction<{ cellIndex: number; card: Card }>
    ) => {
      state.board[action.payload.cellIndex].push(action.payload.card);
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
  updateGame,
  pushCardToBoard,
} = gameSlice.actions;

export default gameSlice.reducer;

/* ---------- Thunk Actions ---------- */
// Helper to compute card to place without nested ifs.
const computeCardToPlace = (card: Card, isFirst: boolean, tieBreaker: boolean): Card =>
  isFirst && !tieBreaker ? { ...card, faceDown: true } : { ...card, faceDown: false };

// Refactored applyGameUpdate now uses updateGame to combine state updates.
export const applyGameUpdate = (
  dispatch: any,
  getState: any,
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

export const flipInitialCards = () => (dispatch: any, getState: any) => {
  const { initialFaceDownCards } = getState().game.gameStatus;
  if (initialFaceDownCards[PlayerEnum.PLAYER1] && initialFaceDownCards[PlayerEnum.PLAYER2]) {
    dispatch(setHighlightedCells([]));
    const result = flipInitialCardsLogic(initialFaceDownCards, getState().game.board);
    applyGameUpdate(dispatch, getState, {
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

// Refactored placeCardOnBoard thunk with simplified board update using updateBoardCell.
export const placeCardOnBoard = ({ index, cardIndex }: { index: number; cardIndex: number }) => (
  dispatch: any,
  getState: any
) => {
  const state = getState().game;
  const currentTurn = state.turn.currentTurn;
  const card = state.players[currentTurn].hand[cardIndex];
  if (!card) {
    dispatch(setTurn(getNextPlayerTurn(currentTurn)));
    return;
  }
  const { firstMove, tieBreaker } = state.gameStatus;
  const cardToPlace = computeCardToPlace(card, firstMove[currentTurn], tieBreaker);
  if (firstMove[currentTurn] || tieBreaker) {
    dispatch(setInitialFaceDownCards({ [currentTurn]: { ...cardToPlace, cellIndex: index } }));
  }
  const updatedPlayers = updatePlayerHandAndDrawCard(state.players, currentTurn, cardIndex, cardIndex);
  const newBoard = updateBoardCell(state.board, index, cardToPlace);
  applyGameUpdate(dispatch, getState, {
    updatedPlayers,
    newBoardState: newBoard,
    newFirstMove: { ...state.gameStatus.firstMove, [currentTurn]: false },
    nextPlayerTurn: getNextPlayerTurn(currentTurn),
  });
  if (isGameOver(updatedPlayers)) dispatch(setGameOver(true));
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
  applyGameUpdate(dispatch, getState, {
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
  if (state.gameStatus.firstMove[playerId]) performFirstMove(dispatch, state, playerId, getState);
  else performRegularTurn(dispatch, state, playerId, getState);
};

const performFirstMove = (dispatch: any, game: GameState, playerId: PlayerEnum, getState: any) => {
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
};

const performRegularTurn = (dispatch: any, game: GameState, playerId: PlayerEnum, getState: any) => {
  const result = performRegularMoveForPlayer(game.players, playerId, game.board);
  applyGameUpdate(dispatch, getState, {
    updatedPlayers: result.updatedPlayers,
    newBoardState: result.newBoardState,
    nextPlayerTurn: result.nextPlayerTurn,
  });
  if (playerId === PlayerEnum.PLAYER2) {
    if (result.moveMade && result.move && result.move.type === 'discard')
      dispatch(discardCard({ cardIndex: result.move.cardIndex, playerId }));
    else {
      const idx = game.players[playerId].hand.findIndex(c => c !== null);
      if (idx !== -1) dispatch(discardCard({ cardIndex: idx, playerId }));
    }
  }
};
