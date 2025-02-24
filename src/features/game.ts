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

/* ---------- Merged Logic from logic.ts ---------- */
/* ---------- Deck Functions ---------- */
export const shuffle = (deck: Cards): void => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
};

export const createDeck = (color: ColorEnum, owner: PlayerEnum): Cards => {
  const suits =
    color === ColorEnum.RED
      ? [SuitEnum.HEARTS, SuitEnum.DIAMONDS]
      : [SuitEnum.CLUBS, SuitEnum.SPADES];
  const ranks = Object.values(RankEnum);
  return suits.flatMap(suit =>
    ranks.map(rank => ({ suit, rank, color, owner, faceDown: false }))
  );
};

/* ---------- Move Calculation Functions ---------- */
export const getValidMoves = (
  playerHand: Cards,
  playerId: PlayerEnum,
  boardState: BoardState,
  boardSize: number,
  isFirst: boolean,
  startingIndices: typeof STARTING_INDICES,
  tieBreaker: boolean
): Move[] => {
  const boardMoves: Move[] = playerHand.flatMap((card, cardIndex) =>
    card
      ? calculateValidMoves(
          cardIndex,
          playerId,
          boardState,
          boardSize,
          isFirst,
          playerHand,
          startingIndices,
          tieBreaker
        ).map(cellIndex => ({ type: 'board', cellIndex, cardIndex }))
      : []
  );
  if (!isFirst && !tieBreaker) {
    const discardMoves: Move[] = playerHand
      .map((card, cardIndex) => (card ? { type: 'discard', cardIndex } : null))
      .filter((move): move is Move => move !== null);
    return [...boardMoves, ...discardMoves];
  }
  return boardMoves;
};

export const calculateValidMoves = (
  cardIndex: number,
  playerType: PlayerEnum,
  boardState: BoardState,
  boardSize: number,
  isFirstMove: boolean,
  hand: Cards,
  startingIndices: typeof STARTING_INDICES,
  isTieBreaker?: boolean
): number[] => {
  const selectedCard = hand[cardIndex];
  if (!selectedCard) return [];
  if (isTieBreaker)
    return calculateTieBreakerMoves(selectedCard, playerType, boardState, boardSize);
  if (isFirstMove) return [startingIndices[playerType]];
  return calculateRegularMoves(selectedCard, playerType, boardState, boardSize);
};

const calculateTieBreakerMoves = (
  card: Card,
  playerType: PlayerEnum,
  boardState: BoardState,
  boardSize: number
): number[] => {
  const homeRow = getHomeRowIndices(playerType, boardSize);
  return getValidMoveIndices(homeRow, boardState, card);
};

const calculateRegularMoves = (
  card: Card,
  playerType: PlayerEnum,
  boardState: BoardState,
  boardSize: number
): number[] => {
  const homeRow = getHomeRowIndices(playerType, boardSize);
  const homeRowValid = getValidMoveIndices(homeRow, boardState, card);
  const connected = findConnectedCellsToHomeRow(playerType, boardState, card.color, boardSize);
  const connectedValid = connected.flatMap(index => {
    const adjacent = getAdjacentIndices(index, boardSize);
    return getValidMoveIndices(adjacent, boardState, card);
  });
  return Array.from(new Set([...homeRowValid, ...connectedValid]));
};

export const getHomeRowIndices = (playerType: PlayerEnum, boardSize: number): number[] => {
  const row = playerType === PlayerEnum.PLAYER1 ? boardSize - 1 : 0;
  return Array.from({ length: boardSize }, (_, i) => row * boardSize + i);
};

export const getValidMoveIndices = (
  indices: number[],
  boardState: BoardState,
  selectedCard: Card
): number[] =>
  indices.filter(index => {
    const cell = boardState[index];
    const topCard = cell[cell.length - 1];
    return !topCard || getCardRank(selectedCard.rank) > getCardRank(topCard.rank);
  });

export const getCardRank = (rank: RankEnum): number => rankOrder[rank];

export const getAdjacentIndices = (index: number, boardSize: number): number[] => {
  const row = Math.floor(index / boardSize);
  const col = index % boardSize;
  const indices: number[] = [];
  if (row > 0) indices.push(index - boardSize);
  if (row < boardSize - 1) indices.push(index + boardSize);
  if (col > 0) indices.push(index - 1);
  if (col < boardSize - 1) indices.push(index + 1);
  return indices;
};

export const findConnectedCellsToHomeRow = (
  playerType: PlayerEnum,
  boardState: BoardState,
  color: ColorEnum,
  boardSize: number
): number[] => {
  const homeRow = getHomeRowIndices(playerType, boardSize).filter(i => {
    const cell = boardState[i];
    const topCard = cell[cell.length - 1];
    return topCard && topCard.color === color;
  });
  return Array.from(exploreConnectedCells(homeRow, boardState, boardSize, color));
};

const exploreConnectedCells = (
  initialCells: number[],
  boardState: BoardState,
  boardSize: number,
  color: ColorEnum
): Set<number> => {
  const visited = new Set<number>(initialCells);
  const queue = [...initialCells];
  while (queue.length) {
    const current = queue.shift()!;
    for (const adj of getAdjacentIndices(current, boardSize)) {
      if (!visited.has(adj)) {
        const cell = boardState[adj];
        const topCard = cell[cell.length - 1];
        if (topCard && topCard.color === color) {
          visited.add(adj);
          queue.push(adj);
        }
      }
    }
  }
  return visited;
};

/* ---------- Pure Helper Functions (Game Logic) ---------- */
const drawCard = (
  hand: (Card | null)[],
  deck: (Card | null)[]
): { hand: (Card | null)[]; deck: (Card | null)[] } => {
  if (deck.length === 0) return { hand, deck };
  const card = deck[deck.length - 1]!;
  const newDeck = deck.slice(0, deck.length - 1);
  const newHand = [...hand];
  const firstEmpty = newHand.findIndex(c => c === null);
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
    player =>
      player.hand.every(card => card === null) && player.deck.length === 0
  );

/* ---------- Helper: select a random move from list ---------- */
const selectRandomMove = (moves: Move[]): Move | null =>
  moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;

/* ---------- New Helper: update board cell ---------- */
export const updateBoardCell = (
  board: BoardState,
  cellIndex: CardIndex,
  card: Card
): BoardState =>
  board.map((cell, idx) =>
    idx === cellIndex ? [...cell, card] : cell
  );

/* ---------- New Helpers for Flipping Initial Cards ---------- */
const flipCardsInBoard = (
  initialFaceDownCards: InitialFaceDownCards,
  boardState: BoardState
): BoardState => {
  const newBoardState = boardState.map(cell => [...cell]);
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
      firstMove: { [PlayerEnum.PLAYER1]: false, [PlayerEnum.PLAYER2]: false },
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

/* ---------- New Helper: Handle Card Drag Logic ---------- */
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

/* ---------- New Helper Functions for Reducer Logic ---------- */
// Process a player's first move.
const processFirstMove = (
  players: Players,
  board: BoardState,
  playerId: PlayerEnum,
  tieBreaker: boolean
): { board: BoardState; players: Players; faceDownCard?: FaceDownCard } => {
  const card = players[playerId].hand[0];
  if (!card) return { board, players };
  const move = selectRandomMove(
    getValidMoves(players[playerId].hand, playerId, board, BOARD_SIZE, true, STARTING_INDICES, tieBreaker)
  );
  const faceDownCard =
    move?.cellIndex !== undefined
      ? (() => {
          const placed = { ...card, faceDown: !tieBreaker };
          return { board: updateBoardCell(board, move.cellIndex, placed), card: { ...placed, cellIndex: move.cellIndex } };
        })()
      : undefined;
  players = updatePlayerHandAndDrawCard(players, playerId, 0);
  return { board: faceDownCard ? faceDownCard.board : board, players, faceDownCard: faceDownCard ? faceDownCard.card : undefined };
};

// Process a player's regular move.
const processRegularMove = (
  players: Players,
  board: BoardState,
  playerId: PlayerEnum,
  tieBreaker: boolean
): { board: BoardState; players: Players; discardCard?: Card } => {
  const move = selectRandomMove(
    getValidMoves(players[playerId].hand, playerId, board, BOARD_SIZE, false, STARTING_INDICES, tieBreaker)
  );
  if (!move) return { board, players };
  const card = players[playerId].hand[move.cardIndex];
  if (!card) return { board, players };
  if (move.type === 'board' && move.cellIndex !== undefined) {
    board = updateBoardCell(board, move.cellIndex, card);
  }
  return {
    board,
    players: updatePlayerHandAndDrawCard(players, playerId, move.cardIndex),
    discardCard: move.type === 'discard' ? { ...card, faceDown: true } : undefined,
  };
};

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
    setInitialFaceDownCards: (
      state,
      action: PayloadAction<{ [key in PlayerEnum]?: Card & { cellIndex: CardIndex } }>
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
          state.players = updatePlayerHandAndDrawCard(state.players, playerId, cardIndex);
          state.turn.currentTurn = getNextPlayerTurn(playerId);
        },
        board: () => {
          if (boardIndex === undefined) return;
          const isFirst = state.gameStatus.firstMove[playerId];
          const tieBreaker = state.gameStatus.tieBreaker;
          const cardCopy = { ...cardToMove, faceDown: isFirst && !tieBreaker };
          if (isFirst || tieBreaker) {
            state.gameStatus.initialFaceDownCards[playerId] = { ...cardCopy, cellIndex: boardIndex };
          }
          state.board[boardIndex].push(cardCopy);
          state.players = updatePlayerHandAndDrawCard(state.players, playerId, cardIndex);
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
      state.highlightedCells = [];
      state.draggingPlayer = null;
      state.highlightDiscardPile = false;
    },
    /* ---------- New Reducer: Process a Player’s Turn ---------- */
    processTurn: (state, action: PayloadAction<{ playerId: PlayerEnum }>) => {
      const { playerId } = action.payload;
      if (state.gameStatus.gameOver || state.turn.currentTurn !== playerId) return;
      if (state.gameStatus.firstMove[playerId]) {
        const result = processFirstMove(state.players, state.board, playerId, state.gameStatus.tieBreaker);
        state.board = result.board;
        state.players = result.players;
        if (result.faceDownCard)
          state.gameStatus.initialFaceDownCards[playerId] = result.faceDownCard;
        state.gameStatus.firstMove[playerId] = false;
      } else {
        const result = processRegularMove(state.players, state.board, playerId, state.gameStatus.tieBreaker);
        state.board = result.board;
        state.players = result.players;
        if (result.discardCard)
          state.discard[playerId].push(result.discardCard);
      }
      state.turn.currentTurn = getNextPlayerTurn(playerId);
      if (isGameOver(state.players)) state.gameStatus.gameOver = true;
      state.highlightedCells = [];
      state.draggingPlayer = null;
      state.highlightDiscardPile = false;
    },
    /* ---------- New Reducer: Flip Initial Face–Down Cards ---------- */
    flipInitialCards: state => {
      const faceDown = state.gameStatus.initialFaceDownCards;
      if (!faceDown[PlayerEnum.PLAYER1] || !faceDown[PlayerEnum.PLAYER2]) return;
      state.board = flipCardsInBoard(faceDown, state.board);
      const { nextPlayerTurn, tieBreaker, firstMove } = determineTurnAndTieBreaker(faceDown);
      state.turn.currentTurn = nextPlayerTurn;
      state.gameStatus.tieBreaker = tieBreaker;
      state.gameStatus.firstMove = firstMove;
      state.gameStatus.initialFaceDownCards = {};
      if (isGameOver(state.players)) state.gameStatus.gameOver = true;
      state.highlightedCells = [];
      state.draggingPlayer = null;
      state.highlightDiscardPile = false;
    },
    /* ---------- New Reducer: Start Card Drag (for UI highlighting) ---------- */
    startCardDrag: (
      state,
      action: PayloadAction<{ cardIndex: CardIndex; playerId: PlayerEnum }>
    ) => {
      const { cardIndex, playerId } = action.payload;
      state.highlightedCells = handleCardDragLogic(
        cardIndex,
        playerId,
        state.board,
        state.players,
        state.gameStatus.firstMove,
        state.gameStatus.tieBreaker
      );
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
  pushCardToBoard,
  moveCard,
  processTurn,
  flipInitialCards,
  startCardDrag,
} = gameSlice.actions;

export default gameSlice.reducer;
