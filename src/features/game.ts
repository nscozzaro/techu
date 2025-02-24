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

// Shuffles and returns the deck (in-place shuffling is acceptable)
export const shuffle = (deck: Cards): Cards => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
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

// Splitting move-calculation into two arrays to avoid type conflicts.
export const getValidMoves = (
  hand: Cards,
  playerId: PlayerEnum,
  board: BoardState,
  boardSize: number,
  isFirst: boolean,
  startingIndices: typeof STARTING_INDICES,
  tieBreaker: boolean
): Move[] => {
  const boardMoves: Move[] = hand.flatMap((card, cardIndex) =>
    card
      ? calculateValidMoves(
          cardIndex,
          playerId,
          board,
          boardSize,
          isFirst,
          hand,
          startingIndices,
          tieBreaker
        ).map(cellIndex => ({ type: 'board' as const, cellIndex, cardIndex }))
      : []
  );
  const discardMoves: Move[] =
    !isFirst && !tieBreaker
      ? hand
          .map((card, cardIndex) =>
            card ? { type: 'discard' as const, cardIndex } : null
          )
          .filter(
            (m): m is { type: 'discard'; cardIndex: number } => m !== null
          )
      : [];
  return boardMoves.concat(discardMoves);
};

export const calculateValidMoves = (
  cardIndex: number,
  playerId: PlayerEnum,
  board: BoardState,
  boardSize: number,
  isFirst: boolean,
  hand: Cards,
  startingIndices: typeof STARTING_INDICES,
  tieBreaker?: boolean
): number[] => {
  const card = hand[cardIndex];
  if (!card) return [];
  return tieBreaker
    ? calculateTieBreakerMoves(card, playerId, board, boardSize)
    : isFirst
    ? [startingIndices[playerId]]
    : calculateRegularMoves(card, playerId, board, boardSize);
};

const calculateTieBreakerMoves = (
  card: Card,
  playerId: PlayerEnum,
  board: BoardState,
  boardSize: number
): number[] => {
  const homeRow = getHomeRowIndices(playerId, boardSize);
  return getValidMoveIndices(homeRow, board, card);
};

const calculateRegularMoves = (
  card: Card,
  playerId: PlayerEnum,
  board: BoardState,
  boardSize: number
): number[] => {
  const homeRow = getHomeRowIndices(playerId, boardSize);
  const homeValid = getValidMoveIndices(homeRow, board, card);
  const connected = findConnectedCells(playerId, board, card.color, boardSize);
  const connectedValid = connected.flatMap(index =>
    getValidMoveIndices(getAdjacentIndices(index, boardSize), board, card)
  );
  return Array.from(new Set([...homeValid, ...connectedValid]));
};

export const getHomeRowIndices = (
  playerId: PlayerEnum,
  boardSize: number
): number[] =>
  Array.from({ length: boardSize }, (_, i) =>
    (playerId === PlayerEnum.PLAYER1 ? boardSize - 1 : 0) * boardSize + i
  );

export const getValidMoveIndices = (
  indices: number[],
  board: BoardState,
  card: Card
): number[] =>
  indices.filter(i => {
    const cell = board[i];
    const top = cell[cell.length - 1];
    return !top || getCardRank(card.rank) > getCardRank(top.rank);
  });

export const getCardRank = (rank: RankEnum): number => rankOrder[rank];

export const getAdjacentIndices = (
  index: number,
  boardSize: number
): number[] => {
  const row = Math.floor(index / boardSize);
  const col = index % boardSize;
  const indices: number[] = [];
  if (row > 0) indices.push(index - boardSize);
  if (row < boardSize - 1) indices.push(index + boardSize);
  if (col > 0) indices.push(index - 1);
  if (col < boardSize - 1) indices.push(index + 1);
  return indices;
};

export const findConnectedCells = (
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
  const visited = new Set(start);
  const queue = [...start];
  while (queue.length) {
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

export const updatePlayerHandAndDrawCard = (
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

export const initializePlayer = (color: ColorEnum, id: PlayerEnum) => {
  const deck = shuffle(createDeck(color, id));
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
    p => p.hand.every(c => c === null) && p.deck.length === 0
  );

const selectRandomMove = (moves: Move[]): Move | null =>
  moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;

export const updateBoardCell = (
  board: BoardState,
  cellIndex: CardIndex,
  card: Card
): BoardState =>
  board.map((cell, idx) =>
    idx === cellIndex ? [...cell, card] : cell
  );

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

const determineTurnAndTieBreaker = (faceDownCards: InitialFaceDownCards) => {
  const card1 = faceDownCards[PlayerEnum.PLAYER1];
  const card2 = faceDownCards[PlayerEnum.PLAYER2];
  const rank1 = card1 ? rankOrder[card1.rank] : -1;
  const rank2 = card2 ? rankOrder[card2.rank] : -1;
  return rank1 === rank2
    ? { nextPlayerTurn: PlayerEnum.PLAYER1, tieBreaker: true, firstMove: initialFirstMove() }
    : {
        nextPlayerTurn: rank1 < rank2 ? PlayerEnum.PLAYER1 : PlayerEnum.PLAYER2,
        tieBreaker: false,
        firstMove: { [PlayerEnum.PLAYER1]: false, [PlayerEnum.PLAYER2]: false },
      };
};

export const flipInitialCardsLogic = (
  faceDownCards: InitialFaceDownCards,
  board: BoardState
) =>
  !faceDownCards[PlayerEnum.PLAYER1] || !faceDownCards[PlayerEnum.PLAYER2]
    ? {
        newBoard: board,
        nextPlayerTurn: getNextPlayerTurn(PlayerEnum.PLAYER1),
        tieBreaker: false,
        firstMove: { [PlayerEnum.PLAYER1]: false, [PlayerEnum.PLAYER2]: false },
      }
    : { newBoard: flipCardsInBoard(faceDownCards, board), ...determineTurnAndTieBreaker(faceDownCards) };

export const calculateScores = (board: BoardState): Scores =>
  board.reduce((scores, cell) => {
    if (cell.length > 0) {
      const top = cell[cell.length - 1];
      if (top?.color === ColorEnum.RED) scores[PlayerEnum.PLAYER1]++;
      else if (top?.color === ColorEnum.BLACK) scores[PlayerEnum.PLAYER2]++;
    }
    return scores;
  }, { [PlayerEnum.PLAYER1]: 0, [PlayerEnum.PLAYER2]: 0 } as Scores);

export const handleCardDragLogic = (
  cardIndex: CardIndex,
  playerId: PlayerEnum,
  board: BoardState,
  players: Players,
  firstMove: { [key in PlayerEnum]: boolean },
  tieBreaker: boolean
): number[] =>
  calculateValidMoves(
    cardIndex,
    playerId,
    board,
    BOARD_SIZE,
    firstMove[playerId],
    players[playerId].hand,
    STARTING_INDICES,
    tieBreaker
  );

// Returns a new state UI object so reducers can reset UI properties.
const resetUIState = (): Partial<GameState> => ({
  highlightedCells: [],
  draggingPlayer: null,
  highlightDiscardPile: false,
});

// Place the card on board and return new board and the placed card info.
const placeCardOnBoard = (
  board: BoardState,
  card: Card,
  cellIndex: CardIndex,
  tieBreaker: boolean
): { newBoard: BoardState; placedCard: FaceDownCard } => {
  const placed = { ...card, faceDown: !tieBreaker };
  return {
    newBoard: updateBoardCell(board, cellIndex, placed),
    placedCard: { ...placed, cellIndex },
  };
};

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
  if (move?.cellIndex === undefined) return { board, players };
  const { newBoard, placedCard } = placeCardOnBoard(board, card, move.cellIndex, tieBreaker);
  return {
    board: newBoard,
    players: updatePlayerHandAndDrawCard(players, playerId, 0),
    faceDownCard: placedCard,
  };
};

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
  const newBoard =
    move.type === 'board' && move.cellIndex !== undefined
      ? updateBoardCell(board, move.cellIndex, card)
      : board;
  return {
    board: newBoard,
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
      Object.assign(state, resetUIState());
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
        Object.assign(state, resetUIState());
        return;
      }
      switch (destination) {
        case 'discard':
          if (!state.gameStatus.firstMove[playerId]) {
            state.discard[playerId].push({ ...cardToMove, faceDown: true });
            state.players = updatePlayerHandAndDrawCard(state.players, playerId, cardIndex);
            state.turn.currentTurn = getNextPlayerTurn(playerId);
          }
          break;
        case 'board':
          if (boardIndex !== undefined) {
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
          }
          break;
        case 'hand':
          if (handIndex !== undefined) {
            [player.hand[cardIndex], player.hand[handIndex]] = [
              player.hand[handIndex],
              player.hand[cardIndex],
            ];
          }
          break;
      }
      if (isGameOver(state.players)) state.gameStatus.gameOver = true;
      Object.assign(state, resetUIState());
    },
    processTurn: (state, action: PayloadAction<{ playerId: PlayerEnum }>) => {
      const { playerId } = action.payload;
      if (state.gameStatus.gameOver || state.turn.currentTurn !== playerId) return;
      if (state.gameStatus.firstMove[playerId]) {
        const { board, players, faceDownCard } = processFirstMove(
          state.players,
          state.board,
          playerId,
          state.gameStatus.tieBreaker
        );
        state.board = board;
        state.players = players;
        if (faceDownCard) state.gameStatus.initialFaceDownCards[playerId] = faceDownCard;
        state.gameStatus.firstMove[playerId] = false;
      } else {
        const { board, players, discardCard } = processRegularMove(
          state.players,
          state.board,
          playerId,
          state.gameStatus.tieBreaker
        );
        state.board = board;
        state.players = players;
        if (discardCard) state.discard[playerId].push(discardCard);
      }
      state.turn.currentTurn = getNextPlayerTurn(playerId);
      if (isGameOver(state.players)) state.gameStatus.gameOver = true;
      Object.assign(state, resetUIState());
    },
    flipInitialCards: state => {
      const faceDown = state.gameStatus.initialFaceDownCards;
      if (!faceDown[PlayerEnum.PLAYER1] || !faceDown[PlayerEnum.PLAYER2]) return;
      const { newBoard, nextPlayerTurn, tieBreaker, firstMove } = flipInitialCardsLogic(faceDown, state.board);
      state.board = newBoard;
      state.turn.currentTurn = nextPlayerTurn;
      state.gameStatus.tieBreaker = tieBreaker;
      state.gameStatus.firstMove = firstMove;
      state.gameStatus.initialFaceDownCards = {};
      if (isGameOver(state.players)) state.gameStatus.gameOver = true;
      Object.assign(state, resetUIState());
    },
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
