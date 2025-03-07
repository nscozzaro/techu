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
  initialFirstMove,
  STARTING_INDICES,
  CardIndex,
  FaceDownCard,
  rankOrder,
  SuitEnum,
  RankEnum,
  Cards,
} from '../types';

/* ---------- Helper Functions ---------- */

// Shuffles and returns a deck (in-place)
const shuffle = (deck: Cards): Cards => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const createDeck = (color: ColorEnum, owner: PlayerEnum): Cards => {
  const suits =
    color === ColorEnum.RED
      ? [SuitEnum.HEARTS, SuitEnum.DIAMONDS]
      : [SuitEnum.CLUBS, SuitEnum.SPADES];
  const ranks = Object.values(RankEnum);
  return suits.flatMap(suit =>
    ranks.map(rank => ({ suit, rank, color, owner, faceDown: false }))
  );
};

const getHomeRowIndices = (playerId: PlayerEnum, boardSize: number): number[] => {
  const base = playerId === PlayerEnum.PLAYER1 ? boardSize - 1 : 0;
  return Array.from({ length: boardSize }, (_, i) => base * boardSize + i);
};

const getValidMoveIndices = (indices: number[], board: BoardState, card: Card): number[] =>
  indices.filter(i => {
    const cell = board[i];
    const top = cell[cell.length - 1];
    return !top || getCardRank(card.rank) > getCardRank(top.rank);
  });

const getCardRank = (rank: RankEnum): number => rankOrder[rank];

const getAdjacentIndices = (index: number, boardSize: number): number[] => {
  const row = Math.floor(index / boardSize);
  const col = index % boardSize;
  const offsets = [
    { r: -1, c: 0 },
    { r: 1, c: 0 },
    { r: 0, c: -1 },
    { r: 0, c: 1 },
  ];
  return offsets
    .map(({ r, c }) => {
      const newRow = row + r;
      const newCol = col + c;
      return newRow >= 0 && newRow < boardSize && newCol >= 0 && newCol < boardSize
        ? newRow * boardSize + newCol
        : -1;
    })
    .filter(idx => idx !== -1);
};

const findConnectedCells = (
  playerId: PlayerEnum,
  board: BoardState,
  color: ColorEnum,
  boardSize: number
): number[] => {
  const home = getHomeRowIndices(playerId, boardSize).filter(i => {
    const cell = board[i];
    const top = cell[cell.length - 1];
    return top && top.color === color;
  });
  return Array.from(exploreConnected(home, board, boardSize, color));
};

const exploreConnected = (
  start: number[],
  board: BoardState,
  boardSize: number,
  color: ColorEnum
): Set<number> => {
  const visited = new Set<number>(start);
  const queue = [...start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const adj of getAdjacentIndices(current, boardSize)) {
      if (visited.has(adj)) continue;
      const top = board[adj][board[adj].length - 1];
      if (top && top.color === color) {
        visited.add(adj);
        queue.push(adj);
      }
    }
  }
  return visited;
};

const drawCard = (
  hand: Cards,
  deck: Cards
): { hand: Cards; deck: Cards } => {
  if (deck.length === 0) return { hand, deck };
  const card = deck[deck.length - 1]!;
  const newDeck = deck.slice(0, -1);
  const newHand = [...hand];
  const emptyIndex = newHand.findIndex(c => c === null);
  if (emptyIndex !== -1) newHand[emptyIndex] = card;
  else newHand.push(card);
  return { hand: newHand, deck: newDeck };
};

const updatePlayerHandAndDrawCard = (
  players: Players,
  id: PlayerEnum,
  cardIndex: CardIndex
): Players => {
  const player = players[id];
  const newHand = [...player.hand];
  newHand[cardIndex] = null;
  const result = drawCard(newHand, [...player.deck]);
  return { ...players, [id]: { ...player, hand: result.hand, deck: result.deck } };
};

const initializePlayer = (color: ColorEnum, id: PlayerEnum) => {
  const deck = shuffle(createDeck(color, id));
  return { id, hand: deck.slice(0, 3), deck: deck.slice(3) };
};

const initialPlayers = (): Players => ({
  [PlayerEnum.PLAYER1]: initializePlayer(ColorEnum.RED, PlayerEnum.PLAYER1),
  [PlayerEnum.PLAYER2]: initializePlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2),
});

const initialBoardState = (): BoardState =>
  Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => []);

const initialDiscardPiles = (): DiscardPiles => ({
  [PlayerEnum.PLAYER1]: [],
  [PlayerEnum.PLAYER2]: [],
});

const getNextPlayerTurn = (current: PlayerEnum): PlayerEnum =>
  current === PlayerEnum.PLAYER1 ? PlayerEnum.PLAYER2 : PlayerEnum.PLAYER1;

const isGameOver = (players: Players): boolean =>
  Object.values(players).every(p => p.hand.every(c => c === null) && p.deck.length === 0);

const selectRandomMove = (moves: Move[]): Move | null =>
  moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;

const flipCardsInBoard = (
  faceDownCards: InitialFaceDownCards,
  board: BoardState
): BoardState =>
  board.map((cell, idx) => {
    const cardData = Object.values(faceDownCards).find(c => c && c.cellIndex === idx);
    if (!cardData) return cell;
    const last = cell[cell.length - 1];
    return last ? [...cell.slice(0, -1), { ...last, faceDown: false }] : cell;
  });

const determineTurnAndTieBreaker = (
  faceDownCards: InitialFaceDownCards
): { nextPlayerTurn: PlayerEnum; tieBreaker: boolean; firstMove: PlayerBooleans } => {
  const card1 = faceDownCards[PlayerEnum.PLAYER1];
  const card2 = faceDownCards[PlayerEnum.PLAYER2];
  const rank1 = card1 ? rankOrder[card1.rank] : -1;
  const rank2 = card2 ? rankOrder[card2.rank] : -1;
  if (rank1 === rank2) {
    return { nextPlayerTurn: PlayerEnum.PLAYER1, tieBreaker: true, firstMove: initialFirstMove() };
  }
  return {
    nextPlayerTurn: rank1 < rank2 ? PlayerEnum.PLAYER1 : PlayerEnum.PLAYER2,
    tieBreaker: false,
    firstMove: { [PlayerEnum.PLAYER1]: false, [PlayerEnum.PLAYER2]: false },
  };
};

const flipInitialCardsLogic = (
  faceDownCards: InitialFaceDownCards,
  board: BoardState
) => {
  if (!faceDownCards[PlayerEnum.PLAYER1] || !faceDownCards[PlayerEnum.PLAYER2]) {
    return {
      newBoard: board,
      nextPlayerTurn: getNextPlayerTurn(PlayerEnum.PLAYER1),
      tieBreaker: false,
      firstMove: { [PlayerEnum.PLAYER1]: false, [PlayerEnum.PLAYER2]: false },
    };
  }
  return {
    newBoard: flipCardsInBoard(faceDownCards, board),
    ...determineTurnAndTieBreaker(faceDownCards),
  };
};

const calculateScores = (board: BoardState): Scores =>
  board.reduce((scores, cell) => {
    if (cell.length > 0) {
      const top = cell[cell.length - 1];
      if (top?.color === ColorEnum.RED) scores[PlayerEnum.PLAYER1]++;
      else if (top?.color === ColorEnum.BLACK) scores[PlayerEnum.PLAYER2]++;
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
    // Basic state updates
    setBoardState: (state, action: PayloadAction<BoardState>) => {
      state.board = action.payload;
    },
    updatePlayers: (state, action: PayloadAction<Players>) => {
      state.players = action.payload;
    },
    addDiscardCard: (state, action: PayloadAction<{ playerId: PlayerEnum; card: Card }>) => {
      state.discard[action.payload.playerId].push(action.payload.card);
    },
    resetDiscardPiles: (state) => {
      state.discard = initialDiscardPiles();
    },

    // Game status updates
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
      action: PayloadAction<{ [key in PlayerEnum]?: Card & { cellIndex: CardIndex } }>
    ) => {
      state.gameStatus.initialFaceDownCards = {
        ...state.gameStatus.initialFaceDownCards,
        ...action.payload,
      };
    },
    clearInitialFaceDownCards: (state) => {
      state.gameStatus.initialFaceDownCards = {};
    },

    // Turn management
    setTurn: (state, action: PayloadAction<PlayerEnum>) => {
      state.turn.currentTurn = action.payload;
    },
    nextTurn: (state) => {
      state.turn.currentTurn = getNextPlayerTurn(state.turn.currentTurn);
    },

    // UI state management
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
      Object.assign(state, resetUIState());
    },
    clearHighlights: (state) => {
      state.highlightedCells = [];
      state.highlightDiscardPile = false;
    },

    // Move validation
    getValidTieBreakerMoves: (state, action: PayloadAction<{ playerId: PlayerEnum; card: Card }>) => {
      const { playerId, card } = action.payload;
      const homeRow = getHomeRowIndices(playerId, BOARD_SIZE);
      state.highlightedCells = getValidMoveIndices(homeRow, state.board, card);
    },
    getValidFirstMoves: (state, action: PayloadAction<{ playerId: PlayerEnum }>) => {
      const { playerId } = action.payload;
      state.highlightedCells = [STARTING_INDICES[playerId]];
    },
    getValidRegularMoves: (state, action: PayloadAction<{ playerId: PlayerEnum; card: Card }>) => {
      const { playerId, card } = action.payload;
      const validMoves = getValidRegularMovesHelper(playerId, card, state.board);
      state.highlightedCells = validMoves;
    },

    // Card movement
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
        handleEmptyCardMove(state, playerId);
        return;
      }

      handleCardMove(state, playerId, cardIndex, cardToMove, destination, boardIndex, handIndex);
      finalizeMove(state);
    },

    // Process turn
    processTurn: (state, action: PayloadAction<{ playerId: PlayerEnum }>) => {
      const { playerId } = action.payload;
      if (!canProcessTurn(state, playerId)) return;
      
      const move = getNextMove(state, playerId);
      if (!move) return;
      
      processMove(state, playerId, move);
      finalizeTurn(state, playerId);
    },

    // Card flipping
    flipInitialCards: (state) => {
      if (!canFlipInitialCards(state)) return;
      
      const result = flipInitialCardsLogic(state.gameStatus.initialFaceDownCards, state.board);
      updateStateAfterFlip(state, result);
    },

    // Card dragging
    startCardDrag: (
      state,
      action: PayloadAction<{ cardIndex: CardIndex; playerId: PlayerEnum }>
    ) => {
      const { cardIndex, playerId } = action.payload;
      const card = state.players[playerId].hand[cardIndex];
      
      if (!card) {
        gameSlice.caseReducers.clearHighlights(state);
        return;
      }

      updateValidMoves(state, playerId, card);
      gameSlice.caseReducers.updateDiscardHighlight(state, { payload: { playerId }, type: 'game/updateDiscardHighlight' });
    },

    // Discard pile highlighting
    updateDiscardHighlight: (state, action: PayloadAction<{ playerId: PlayerEnum }>) => {
      const { playerId } = action.payload;
      state.highlightDiscardPile = 
        state.turn.currentTurn === playerId && !state.gameStatus.firstMove[playerId];
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
  clearHighlights,
  getValidTieBreakerMoves,
  getValidFirstMoves,
  getValidRegularMoves,
  updateDiscardHighlight,
  moveCard,
  processTurn,
  flipInitialCards,
  startCardDrag,
} = gameSlice.actions;

// Export helper functions for external usage
export { calculateScores, isGameOver };

export default gameSlice.reducer;

function resetUIState(): Partial<GameState> {
  return {
    highlightedCells: [],
    draggingPlayer: null,
    highlightDiscardPile: false,
  };
}

const handleDiscardMove = (
  state: GameState,
  playerId: PlayerEnum,
  cardIndex: CardIndex,
  cardToMove: Card
): void => {
  addCardToDiscard(state, playerId, cardToMove);
  updatePlayerAfterMove(state, playerId, cardIndex);
  updateTurn(state, playerId);
};

const addCardToDiscard = (state: GameState, playerId: PlayerEnum, card: Card): void => {
  state.discard[playerId].push({ ...card, faceDown: true });
};

const updatePlayerAfterMove = (state: GameState, playerId: PlayerEnum, cardIndex: CardIndex): void => {
  state.players = updatePlayerHandAndDrawCard(state.players, playerId, cardIndex);
};

const updateTurn = (state: GameState, playerId: PlayerEnum): void => {
  state.turn.currentTurn = getNextPlayerTurn(playerId);
};

const handleBoardMove = (
  state: GameState,
  playerId: PlayerEnum,
  cardIndex: CardIndex,
  cardToMove: Card,
  boardIndex: number
): void => {
  const cardCopy = createBoardCard(state, playerId, cardToMove);
  updateInitialFaceDownCards(state, playerId, cardCopy, boardIndex);
  addCardToBoard(state, boardIndex, cardCopy);
  updatePlayerAndGameState(state, playerId, cardIndex);
};

const createBoardCard = (state: GameState, playerId: PlayerEnum, card: Card): Card => {
  const isFirst = state.gameStatus.firstMove[playerId];
  const tieBreaker = state.gameStatus.tieBreaker;
  return { ...card, faceDown: isFirst && !tieBreaker };
};

const updateInitialFaceDownCards = (
  state: GameState,
  playerId: PlayerEnum,
  card: Card,
  boardIndex: number
): void => {
  if (state.gameStatus.firstMove[playerId] || state.gameStatus.tieBreaker) {
    state.gameStatus.initialFaceDownCards[playerId] = { ...card, cellIndex: boardIndex };
  }
};

const addCardToBoard = (state: GameState, boardIndex: number, card: Card): void => {
  state.board[boardIndex].push(card);
};

const updatePlayerAndGameState = (
  state: GameState,
  playerId: PlayerEnum,
  cardIndex: CardIndex
): void => {
  updatePlayerAfterMove(state, playerId, cardIndex);
  state.gameStatus.firstMove[playerId] = false;
  updateTurn(state, playerId);
};

const handleHandMove = (
  player: Players[PlayerEnum],
  cardIndex: CardIndex,
  handIndex: CardIndex
): void => {
  [player.hand[cardIndex], player.hand[handIndex]] = [player.hand[handIndex], player.hand[cardIndex]];
};

const handleEmptyCardMove = (state: GameState, playerId: PlayerEnum): void => {
  updateTurn(state, playerId);
  Object.assign(state, resetUIState());
};

const finalizeMove = (state: GameState): void => {
  checkGameOver(state);
  Object.assign(state, resetUIState());
};

const checkGameOver = (state: GameState): void => {
  if (isGameOver(state.players)) {
    state.gameStatus.gameOver = true;
  }
};

// Move generation helpers
const getFirstMoveBoardMoves = (
  playerId: PlayerEnum,
  player: Players[PlayerEnum],
  board: BoardState,
  isTieBreaker: boolean
): Move[] => {
  const card = player.hand[0];
  if (!card) return [];
  return getValidFirstMoveIndices(playerId, card, board, isTieBreaker)
    .map(createBoardMove);
};

const getValidFirstMoveIndices = (
  playerId: PlayerEnum,
  card: Card,
  board: BoardState,
  isTieBreaker: boolean
): number[] => {
  return isTieBreaker
    ? getValidMoveIndices(getHomeRowIndices(playerId, BOARD_SIZE), board, card)
    : [STARTING_INDICES[playerId]];
};

const createBoardMove = (cellIndex: number): Move => ({
  type: 'board',
  cellIndex,
  cardIndex: 0,
});

const getRegularMovesForCard = (
  playerId: PlayerEnum,
  card: Card,
  cardIndex: number,
  board: BoardState,
  isTieBreaker: boolean
): Move[] => {
  const validMoves = getValidMoveIndicesForCard(playerId, card, board, isTieBreaker);
  const boardMoves = validMoves.map(cellIndex => createBoardMoveWithIndex(cellIndex, cardIndex));
  const discardMoves = getDiscardMovesIfAllowed(cardIndex, isTieBreaker);
  return [...boardMoves, ...discardMoves];
};

const getValidMoveIndicesForCard = (
  playerId: PlayerEnum,
  card: Card,
  board: BoardState,
  isTieBreaker: boolean
): number[] => {
  if (isTieBreaker) {
    return getValidMoveIndices(getHomeRowIndices(playerId, BOARD_SIZE), board, card);
  }
  return getValidRegularMovesHelper(playerId, card, board);
};

const createBoardMoveWithIndex = (cellIndex: number, cardIndex: number): Move => ({
  type: 'board',
  cellIndex,
  cardIndex,
});

const getDiscardMovesIfAllowed = (cardIndex: number, isTieBreaker: boolean): Move[] => {
  return !isTieBreaker ? [{ type: 'discard' as const, cardIndex }] : [];
};

const getRegularMoves = (
  playerId: PlayerEnum,
  player: Players[PlayerEnum],
  board: BoardState,
  isTieBreaker: boolean
): Move[] => {
  return player.hand.flatMap((card, idx) =>
    card ? getRegularMovesForCard(playerId, card, idx, board, isTieBreaker) : []
  );
};

const processFirstMove = (
  state: GameState,
  playerId: PlayerEnum,
  move: Move
): void => {
  const card = state.players[playerId].hand[0];
  if (!card || move.cellIndex === undefined) return;
  
  const placedCard = createFirstMoveCard(state, card);
  placeFirstMoveCard(state, playerId, placedCard, move.cellIndex);
  updatePlayerAndFirstMove(state, playerId);
};

const createFirstMoveCard = (state: GameState, card: Card): Card => {
  return { ...card, faceDown: !state.gameStatus.tieBreaker };
};

const placeFirstMoveCard = (
  state: GameState,
  playerId: PlayerEnum,
  card: Card,
  cellIndex: number
): void => {
  addCardToBoard(state, cellIndex, card);
  state.gameStatus.initialFaceDownCards[playerId] = { ...card, cellIndex };
};

const updatePlayerAndFirstMove = (state: GameState, playerId: PlayerEnum): void => {
  updatePlayerAfterMove(state, playerId, 0);
  state.gameStatus.firstMove[playerId] = false;
};

const processRegularMove = (
  state: GameState,
  playerId: PlayerEnum,
  move: Move
): void => {
  const card = state.players[playerId].hand[move.cardIndex];
  if (!card) return;
  
  processCardMove(state, playerId, card, move);
  updatePlayerAfterMove(state, playerId, move.cardIndex);
};

const processCardMove = (
  state: GameState,
  playerId: PlayerEnum,
  card: Card,
  move: Move
): void => {
  if (move.type === 'board' && move.cellIndex !== undefined) {
    addCardToBoard(state, move.cellIndex, card);
  } else if (move.type === 'discard') {
    addCardToDiscard(state, playerId, card);
  }
};

const finalizeTurn = (state: GameState, playerId: PlayerEnum): void => {
  updateTurn(state, playerId);
  checkGameOver(state);
  Object.assign(state, resetUIState());
};

// Helper functions for reducers
const getValidRegularMovesHelper = (playerId: PlayerEnum, card: Card, board: BoardState): number[] => {
  const homeRow = getHomeRowIndices(playerId, BOARD_SIZE);
  const homeValid = getValidMoveIndices(homeRow, board, card);
  const connected = findConnectedCells(playerId, board, card.color, BOARD_SIZE);
  const connectedValid = connected.flatMap(index =>
    getValidMoveIndices(getAdjacentIndices(index, BOARD_SIZE), board, card)
  );
  return Array.from(new Set([...homeValid, ...connectedValid]));
};

const handleCardMove = (
  state: GameState,
  playerId: PlayerEnum,
  cardIndex: CardIndex,
  cardToMove: Card,
  destination: string,
  boardIndex?: number,
  handIndex?: number
): void => {
  if (destination === 'discard' && !state.gameStatus.firstMove[playerId]) {
    handleDiscardMove(state, playerId, cardIndex, cardToMove);
  } else if (destination === 'board' && boardIndex !== undefined) {
    handleBoardMove(state, playerId, cardIndex, cardToMove, boardIndex);
  } else if (destination === 'hand' && handIndex !== undefined) {
    handleHandMove(state.players[playerId], cardIndex, handIndex);
  }
};

const canProcessTurn = (state: GameState, playerId: PlayerEnum): boolean => {
  return !state.gameStatus.gameOver && state.turn.currentTurn === playerId;
};

const getNextMove = (state: GameState, playerId: PlayerEnum): Move | null => {
  const moves = state.gameStatus.firstMove[playerId]
    ? getFirstMoveBoardMoves(playerId, state.players[playerId], state.board, state.gameStatus.tieBreaker)
    : getRegularMoves(playerId, state.players[playerId], state.board, state.gameStatus.tieBreaker);
  return selectRandomMove(moves);
};

const processMove = (state: GameState, playerId: PlayerEnum, move: Move): void => {
  if (state.gameStatus.firstMove[playerId]) {
    processFirstMove(state, playerId, move);
  } else {
    processRegularMove(state, playerId, move);
  }
};

const canFlipInitialCards = (state: GameState): boolean => {
  const faceDown = state.gameStatus.initialFaceDownCards;
  return !!(faceDown[PlayerEnum.PLAYER1] && faceDown[PlayerEnum.PLAYER2]);
};

const updateStateAfterFlip = (
  state: GameState,
  result: ReturnType<typeof flipInitialCardsLogic>
): void => {
  state.board = result.newBoard;
  state.turn.currentTurn = result.nextPlayerTurn;
  state.gameStatus.tieBreaker = result.tieBreaker;
  state.gameStatus.firstMove = result.firstMove;
  state.gameStatus.initialFaceDownCards = {};
  if (isGameOver(state.players)) state.gameStatus.gameOver = true;
  Object.assign(state, resetUIState());
};

const updateValidMoves = (state: GameState, playerId: PlayerEnum, card: Card): void => {
  if (state.gameStatus.tieBreaker) {
    gameSlice.caseReducers.getValidTieBreakerMoves(state, { 
      payload: { playerId, card }, 
      type: 'game/getValidTieBreakerMoves' 
    });
  } else if (state.gameStatus.firstMove[playerId]) {
    gameSlice.caseReducers.getValidFirstMoves(state, { 
      payload: { playerId }, 
      type: 'game/getValidFirstMoves' 
    });
  } else {
    gameSlice.caseReducers.getValidRegularMoves(state, { 
      payload: { playerId, card }, 
      type: 'game/getValidRegularMoves' 
    });
  }
};
