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
    resetUI: (state) => {
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
      if (destination === 'discard' && !state.gameStatus.firstMove[playerId]) {
        state.discard[playerId].push({ ...cardToMove, faceDown: true });
        state.players = updatePlayerHandAndDrawCard(state.players, playerId, cardIndex);
        state.turn.currentTurn = getNextPlayerTurn(playerId);
      } else if (destination === 'board' && boardIndex !== undefined) {
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
      } else if (destination === 'hand' && handIndex !== undefined) {
        [player.hand[cardIndex], player.hand[handIndex]] = [player.hand[handIndex], player.hand[cardIndex]];
      }
      if (isGameOver(state.players)) state.gameStatus.gameOver = true;
      Object.assign(state, resetUIState());
    },
    processTurn: (state, action: PayloadAction<{ playerId: PlayerEnum }>) => {
      const { playerId } = action.payload;
      if (state.gameStatus.gameOver || state.turn.currentTurn !== playerId) return;
      
      let moves: Move[] = [];
      const player = state.players[playerId];
      
      if (state.gameStatus.firstMove[playerId]) {
        // First move – only consider the card at index 0.
        const card = player.hand[0];
        if (card) {
          let validMoves: number[] = [];
          if (state.gameStatus.tieBreaker) {
            const homeRow = getHomeRowIndices(playerId, BOARD_SIZE);
            validMoves = getValidMoveIndices(homeRow, state.board, card);
          } else {
            validMoves = [STARTING_INDICES[playerId]];
          }
          const boardMoves: Move[] = validMoves.map((cellIndex): Move => ({
            type: 'board',
            cellIndex,
            cardIndex: 0,
          }));
          moves = moves.concat(boardMoves);
        }
      } else {
        // Regular move – check every card in hand.
        player.hand.forEach((card, idx) => {
          if (card) {
            let validMoves: number[] = [];
            if (state.gameStatus.tieBreaker) {
              const homeRow = getHomeRowIndices(playerId, BOARD_SIZE);
              validMoves = getValidMoveIndices(homeRow, state.board, card);
            } else {
              const homeRow = getHomeRowIndices(playerId, BOARD_SIZE);
              const homeValid = getValidMoveIndices(homeRow, state.board, card);
              const connected = findConnectedCells(playerId, state.board, card.color, BOARD_SIZE);
              const connectedValid = connected.flatMap(index =>
                getValidMoveIndices(getAdjacentIndices(index, BOARD_SIZE), state.board, card)
              );
              validMoves = Array.from(new Set([...homeValid, ...connectedValid]));
            }
            const boardMoves: Move[] = validMoves.map((cellIndex): Move => ({
              type: 'board',
              cellIndex,
              cardIndex: idx,
            }));
            const discardMoves: Move[] = !state.gameStatus.tieBreaker
              ? ([{ type: 'discard', cardIndex: idx }] as Move[])
              : [];
            moves = moves.concat(boardMoves, discardMoves);
          }
        });
      }
      
      const move = selectRandomMove(moves);
      if (!move) return;
      
      if (state.gameStatus.firstMove[playerId]) {
        // Process first move.
        const card = player.hand[0];
        if (!card) return;
        const placedCard = { ...card, faceDown: !state.gameStatus.tieBreaker };
        if (move.cellIndex !== undefined) {
          state.board[move.cellIndex].push(placedCard);
          state.gameStatus.initialFaceDownCards[playerId] = { ...placedCard, cellIndex: move.cellIndex };
        }
        state.players = updatePlayerHandAndDrawCard(state.players, playerId, 0);
        state.gameStatus.firstMove[playerId] = false;
      } else {
        // Process regular move.
        const card = player.hand[move.cardIndex];
        if (!card) return;
        if (move.type === 'board' && move.cellIndex !== undefined) {
          state.board[move.cellIndex].push(card);
        } else if (move.type === 'discard') {
          state.discard[playerId].push({ ...card, faceDown: true });
        }
        state.players = updatePlayerHandAndDrawCard(state.players, playerId, move.cardIndex);
      }
      
      state.turn.currentTurn = getNextPlayerTurn(playerId);
      if (isGameOver(state.players)) state.gameStatus.gameOver = true;
      Object.assign(state, resetUIState());
    },
    flipInitialCards: (state) => {
      const faceDown = state.gameStatus.initialFaceDownCards;
      if (!faceDown[PlayerEnum.PLAYER1] || !faceDown[PlayerEnum.PLAYER2]) return;
      const { newBoard, nextPlayerTurn, tieBreaker, firstMove } = flipInitialCardsLogic(
        faceDown,
        state.board
      );
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
      const card = state.players[playerId].hand[cardIndex];
      if (!card) {
        state.highlightedCells = [];
        state.highlightDiscardPile = false;
        return;
      }
      const validMoves = (() => {
        if (state.gameStatus.tieBreaker) {
          const homeRow = getHomeRowIndices(playerId, BOARD_SIZE);
          return getValidMoveIndices(homeRow, state.board, card);
        }
        if (state.gameStatus.firstMove[playerId]) {
          return [STARTING_INDICES[playerId]];
        }
        const homeRow = getHomeRowIndices(playerId, BOARD_SIZE);
        const homeValid = getValidMoveIndices(homeRow, state.board, card);
        const connected = findConnectedCells(playerId, state.board, card.color, BOARD_SIZE);
        const connectedValid = connected.flatMap(index =>
          getValidMoveIndices(getAdjacentIndices(index, BOARD_SIZE), state.board, card)
        );
        return Array.from(new Set([...homeValid, ...connectedValid]));
      })();
      state.highlightedCells = validMoves;
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
