// game.ts

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
  CellIndices,
  BoardSize,
  CellIndex,
  CardRank,
  Seed,
  DestinationEnum,
} from '../types';

/* ---------- Daily Card Generation Utilities ---------- */

// Generate a seed based on the current date (resets at midnight)
const getDailySeed = (): Seed => {
  const date = new Date();
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
};

// Seeded random number generator
const seededRandom = (seed: Seed) => {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

// Deterministic shuffle using the daily seed
const deterministicShuffle = (deck: Cards, seed: Seed, playerId: PlayerEnum): Cards => {
  // Use player ID (0 or 1) to create two different seeds
  const playerSeed = seed * 2 + (playerId === PlayerEnum.PLAYER1 ? 0 : 1);
  const random = seededRandom(playerSeed);
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/* ---------- Helper Functions ---------- */

// Replace the existing shuffle function with the deterministic version
const shuffle = (deck: Cards, playerId: PlayerEnum): Cards => {
  return deterministicShuffle(deck, getDailySeed(), playerId);
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

const getHomeRowIndices = (playerId: PlayerEnum, boardSize: BoardSize): CellIndices => {
  const rowStart = playerId === PlayerEnum.PLAYER1 ? boardSize - 1 : 0;
  return Array.from({ length: boardSize }, (_, i) => rowStart * boardSize + i);
};

const getValidMoveIndices = (indices: CellIndices, board: BoardState, card: Card): CellIndices =>
  indices.filter(i => {
    const cell = board[i];
    if (!cell || cell.length === 0) return true;
    const top = cell[cell.length - 1];
    return !top || getCardRank(card.rank) > getCardRank(top.rank);
  });

const getCardRank = (rank: RankEnum): CardRank => rankOrder[rank];

const getAdjacentIndices = (index: CellIndex, boardSize: BoardSize): CellIndices => {
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
  boardSize: BoardSize
): CellIndices => {
  const home = getHomeRowIndices(playerId, boardSize).filter(i => {
    const cell = board[i];
    const top = cell[cell.length - 1];
    return top && top.color === color;
  });
  return Array.from(exploreConnected(home, board, boardSize, color));
};

const exploreConnected = (
  start: CellIndices,
  board: BoardState,
  boardSize: BoardSize,
  color: ColorEnum
): Set<CellIndex> => {
  const visited = new Set<CellIndex>(start);
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
  if (emptyIndex !== -1) {
    newHand[emptyIndex] = card;
  }
  return { hand: newHand, deck: newDeck };
};

const initializePlayer = (color: ColorEnum, id: PlayerEnum) => {
  // Create and shuffle the deck deterministically
  const deck = shuffle(createDeck(color, id), id);
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
    lastPlayedCard?: { [key in PlayerEnum]?: Card };
  };
  highlightedCells: CellIndices;
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
    setHighlightedCells: (state, action: PayloadAction<CellIndices>) => {
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
    getValidMoves: (state, action: PayloadAction<{ playerId: PlayerEnum; card: Card }>) => {
      const { playerId, card } = action.payload;
      const validMoves = getValidMovesHelper(
        playerId,
        card,
        state.board,
        state.gameStatus.tieBreaker,
        state.gameStatus.firstMove[playerId]
      );
      state.highlightedCells = validMoves;
    },

    // Card movement
    moveCard: (
      state,
      action: PayloadAction<{
        cardIndex: CardIndex;
        playerId: PlayerEnum;
        destination: DestinationEnum;
        boardIndex?: CellIndex;
        handIndex?: CardIndex;
      }>
    ) => {
      if (state.gameStatus.gameOver) return;
      
      const { cardIndex, playerId, destination, boardIndex, handIndex } = action.payload;
      const player = state.players[playerId];
      const cardToMove = player.hand[cardIndex];

      if (!cardToMove) {
        gameSlice.caseReducers.handleEmptyCardMove(state, { 
          type: 'game/handleEmptyCardMove',
          payload: { playerId } 
        });
        return;
      }

      gameSlice.caseReducers.handleDestinationMove(state, {
        type: 'game/handleDestinationMove',
        payload: {
          playerId,
          cardIndex,
          cardToMove,
          destination,
          boardIndex,
          handIndex,
          player
        }
      });

      gameSlice.caseReducers.finalizeMove(state);
    },

    handleDestinationMove: (
      state,
      action: PayloadAction<{
        playerId: PlayerEnum;
        cardIndex: CardIndex;
        cardToMove: Card;
        destination: DestinationEnum;
        boardIndex?: CellIndex;
        handIndex?: CardIndex;
        player: Players[PlayerEnum];
      }>
    ) => {
      const { playerId, cardIndex, cardToMove, destination, boardIndex, handIndex, player } = action.payload;

      switch (destination) {
        case DestinationEnum.DISCARD:
          if (!state.gameStatus.firstMove[playerId]) {
            gameSlice.caseReducers.handleDiscardMove(state, { 
              type: 'game/handleDiscardMove',
              payload: { playerId, cardIndex, cardToMove } 
            });
          }
          break;
        case DestinationEnum.BOARD:
          if (boardIndex !== undefined) {
            gameSlice.caseReducers.handleBoardMove(state, { 
              type: 'game/handleBoardMove',
              payload: { playerId, cardIndex, cardToMove, boardIndex } 
            });
          }
          break;
        case DestinationEnum.HAND:
          if (handIndex !== undefined) {
            gameSlice.caseReducers.handleHandMove(state, { 
              type: 'game/handleHandMove',
              payload: { player, cardIndex, handIndex } 
            });
          }
          break;
      }
    },

    // Process turn
    processTurn: (state, action: PayloadAction<{ playerId: PlayerEnum }>) => {
      const { playerId } = action.payload;
      if (!canProcessTurn(state, playerId)) return;
      
      const move = getNextMove(state, playerId);
      if (!move) return;
      
      gameSlice.caseReducers.processMove(state, {
        type: 'game/processMove',
        payload: { playerId, move }
      });
      
      state.turn.currentTurn = getNextPlayerTurn(playerId);
      if (isGameOver(state.players)) {
        state.gameStatus.gameOver = true;
      }
      state.highlightedCells = [];
      state.draggingPlayer = null;
      state.highlightDiscardPile = false;
    },

    processMove: (state, action: PayloadAction<{ playerId: PlayerEnum; move: Move }>) => {
      const { playerId, move } = action.payload;
      const card = state.players[playerId].hand[move.cardIndex];
      if (!card) return;

      if (state.gameStatus.firstMove[playerId]) {
        if (move.cellIndex === undefined) return;
        const placedCard = { ...card, faceDown: !state.gameStatus.tieBreaker };
        state.board[move.cellIndex].push(placedCard);
        state.gameStatus.initialFaceDownCards[playerId] = { ...placedCard, cellIndex: move.cellIndex };
        gameSlice.caseReducers.updatePlayerHandAndDrawCard(state, {
          type: 'game/updatePlayerHandAndDrawCard',
          payload: { playerId, cardIndex: move.cardIndex }
        });
        state.gameStatus.firstMove[playerId] = false;
      } else {
        if (move.type === DestinationEnum.BOARD && move.cellIndex !== undefined) {
          state.board[move.cellIndex].push(card);
        } else if (move.type === DestinationEnum.DISCARD) {
          state.discard[playerId].push({ ...card, faceDown: true });
        }
        gameSlice.caseReducers.updatePlayerHandAndDrawCard(state, {
          type: 'game/updatePlayerHandAndDrawCard',
          payload: { playerId, cardIndex: move.cardIndex }
        });
      }
    },

    // Card flipping
    flipInitialCards: (state) => {
      if (!canFlipInitialCards(state)) return;
      
      const result = flipInitialCardsLogic(state.gameStatus.initialFaceDownCards, state.board);
      gameSlice.caseReducers.updateStateAfterFlip(state, {
        type: 'game/updateStateAfterFlip',
        payload: result
      });
    },

    updateStateAfterFlip: (
      state,
      action: PayloadAction<ReturnType<typeof flipInitialCardsLogic>>
    ) => {
      const result = action.payload;
      state.board = result.newBoard;
      state.turn.currentTurn = result.nextPlayerTurn;
      state.gameStatus.tieBreaker = result.tieBreaker;
      state.gameStatus.firstMove = result.firstMove;
      state.gameStatus.initialFaceDownCards = {};
      if (isGameOver(state.players)) state.gameStatus.gameOver = true;
      Object.assign(state, resetUIState());
    },

    // Card dragging
    startCardDrag: (
      state,
      action: PayloadAction<{ cardIndex: CardIndex; playerId: PlayerEnum }>
    ) => {
      const { cardIndex, playerId } = action.payload;
      const card = state.players[playerId].hand[cardIndex];
      
      // Reset UI state first
      state.highlightedCells = [];
      state.draggingPlayer = null;
      state.highlightDiscardPile = false;

      // Return early if no card or if it's not the player's turn during tiebreaker
      if (!card || (state.gameStatus.tieBreaker && state.turn.currentTurn !== playerId)) {
        return;
      }

      const validMoves = getValidMovesHelper(
        playerId,
        card,
        state.board,
        state.gameStatus.tieBreaker,
        state.gameStatus.firstMove[playerId]
      );
      state.highlightedCells = validMoves;
      state.highlightDiscardPile = state.turn.currentTurn === playerId && !state.gameStatus.firstMove[playerId];
    },

    // Discard pile highlighting
    updateDiscardHighlight: (state, action: PayloadAction<{ playerId: PlayerEnum }>) => {
      const { playerId } = action.payload;
      state.highlightDiscardPile = 
        state.turn.currentTurn === playerId && !state.gameStatus.firstMove[playerId];
    },

    // Helper reducers
    resetUIState: (state) => {
      state.highlightedCells = [];
      state.draggingPlayer = null;
      state.highlightDiscardPile = false
    },

    handleDiscardMove: (state, action: PayloadAction<{ playerId: PlayerEnum; cardIndex: CardIndex; cardToMove: Card }>) => {
      const { playerId, cardIndex, cardToMove } = action.payload;
      state.discard[playerId].push({ ...cardToMove, faceDown: true });
      gameSlice.caseReducers.updatePlayerHandAndDrawCard(state, {
        type: 'game/updatePlayerHandAndDrawCard',
        payload: { playerId, cardIndex }
      });
      state.turn.currentTurn = getNextPlayerTurn(playerId);
    },

    handleBoardMove: (state, action: PayloadAction<{ playerId: PlayerEnum; cardIndex: CardIndex; cardToMove: Card; boardIndex: CellIndex }>) => {
      const { playerId, cardIndex, cardToMove, boardIndex } = action.payload;
      const cardCopy = { ...cardToMove, faceDown: state.gameStatus.firstMove[playerId] && !state.gameStatus.tieBreaker };
      
      // Initialize the board cell if it doesn't exist
      if (!state.board[boardIndex]) {
        state.board[boardIndex] = [];
      }
      
      // Check if we need to maintain tie breaker state
      if (state.gameStatus.tieBreaker) {
        // Initialize lastPlayedCard if it doesn't exist
        if (!state.gameStatus.lastPlayedCard) {
          state.gameStatus.lastPlayedCard = {};
        }
        
        // Store the current move
        state.gameStatus.lastPlayedCard[playerId] = cardToMove;
        
        // Check if both players have played their cards
        const player1Card = state.gameStatus.lastPlayedCard[PlayerEnum.PLAYER1];
        const player2Card = state.gameStatus.lastPlayedCard[PlayerEnum.PLAYER2];
        
        if (player1Card && player2Card) {
          // Both players have played, check if ranks are equal
          if (getCardRank(player1Card.rank) === getCardRank(player2Card.rank)) {
            state.gameStatus.tieBreaker = true;
            // During a tie, Player 2 continues playing
            state.turn.currentTurn = PlayerEnum.PLAYER2;
          } else {
            state.gameStatus.tieBreaker = false;
            // If tie is broken, next player plays
            state.turn.currentTurn = getNextPlayerTurn(playerId);
          }
          // Reset lastPlayedCard for next round
          state.gameStatus.lastPlayedCard = {};
        } else {
          // Only one player has played, switch turns
          state.turn.currentTurn = getNextPlayerTurn(playerId);
        }
      } else {
        // Not in tiebreaker, normal turn progression
        state.turn.currentTurn = getNextPlayerTurn(playerId);
      }

      if (state.gameStatus.firstMove[playerId] || state.gameStatus.tieBreaker) {
        state.gameStatus.initialFaceDownCards[playerId] = { ...cardCopy, cellIndex: boardIndex };
      }
      
      state.board[boardIndex].push(cardCopy);
      gameSlice.caseReducers.updatePlayerHandAndDrawCard(state, {
        type: 'game/updatePlayerHandAndDrawCard',
        payload: { playerId, cardIndex }
      });
      state.gameStatus.firstMove[playerId] = false;
    },

    handleHandMove: (state, action: PayloadAction<{ player: Players[PlayerEnum]; cardIndex: CardIndex; handIndex: CardIndex }>) => {
      const { player, cardIndex, handIndex } = action.payload;
      [player.hand[cardIndex], player.hand[handIndex]] = [player.hand[handIndex], player.hand[cardIndex]];
    },

    handleEmptyCardMove: (state, action: PayloadAction<{ playerId: PlayerEnum }>) => {
      const { playerId } = action.payload;
      state.turn.currentTurn = getNextPlayerTurn(playerId);
      state.highlightedCells = [];
      state.draggingPlayer = null;
      state.highlightDiscardPile = false;
    },

    finalizeMove: (state) => {
      if (isGameOver(state.players)) {
        state.gameStatus.gameOver = true;
      }
      gameSlice.caseReducers.resetUIState(state);
    },

    // Updated processFirstMove to use the selected card index rather than always index 0
    processFirstMove: (state, action: PayloadAction<{ playerId: PlayerEnum; move: Move }>) => {
      const { playerId, move } = action.payload;
      const card = state.players[playerId].hand[move.cardIndex];
      if (!card || move.cellIndex === undefined) return;
      
      const placedCard = { ...card, faceDown: !state.gameStatus.tieBreaker };
      state.board[move.cellIndex].push(placedCard);
      state.gameStatus.initialFaceDownCards[playerId] = { ...placedCard, cellIndex: move.cellIndex };
      
      gameSlice.caseReducers.updatePlayerHandAndDrawCard(state, {
        type: 'game/updatePlayerHandAndDrawCard',
        payload: { playerId, cardIndex: move.cardIndex }
      });
      state.gameStatus.firstMove[playerId] = false;
    },

    processRegularMove: (state, action: PayloadAction<{ playerId: PlayerEnum; move: Move }>) => {
      const { playerId, move } = action.payload;
      const card = state.players[playerId].hand[move.cardIndex];
      if (!card) return;
      
      if (move.type === DestinationEnum.BOARD && move.cellIndex !== undefined) {
        state.board[move.cellIndex].push(card);
      } else if (move.type === DestinationEnum.DISCARD) {
        state.discard[playerId].push({ ...card, faceDown: true });
      }
      
      gameSlice.caseReducers.updatePlayerHandAndDrawCard(state, {
        type: 'game/updatePlayerHandAndDrawCard',
        payload: { playerId, cardIndex: move.cardIndex }
      });
    },

    finalizeTurn: (state, action: PayloadAction<{ playerId: PlayerEnum }>) => {
      const { playerId } = action.payload;
      state.turn.currentTurn = getNextPlayerTurn(playerId);
      if (isGameOver(state.players)) {
        state.gameStatus.gameOver = true;
      }
      state.highlightedCells = [];
      state.draggingPlayer = null;
      state.highlightDiscardPile = false;
    },

    updateValidMoves: (state: GameState, action: PayloadAction<{ playerId: PlayerEnum; card: Card }>): void => {
      const { playerId, card } = action.payload;
      const validMoves = getValidMovesHelper(
        playerId,
        card,
        state.board,
        state.gameStatus.tieBreaker,
        state.gameStatus.firstMove[playerId]
      );
      state.highlightedCells = validMoves;
    },

    // Add the new caseReducer
    updatePlayerHandAndDrawCard: (
      state,
      action: PayloadAction<{ playerId: PlayerEnum; cardIndex: CardIndex }>
    ) => {
      const { playerId, cardIndex } = action.payload;
      const player = state.players[playerId];
      const newHand = [...player.hand];
      newHand[cardIndex] = null;
      const result = drawCard(newHand, [...player.deck]);
      state.players[playerId] = { ...player, hand: result.hand, deck: result.deck };
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
  getValidMoves,
  moveCard,
  processTurn,
  flipInitialCards,
  startCardDrag,
  updatePlayerHandAndDrawCard,
} = gameSlice.actions;

// Export helper functions for external usage
export { calculateScores, isGameOver };

export default gameSlice.reducer;

function resetUIState(): Partial<GameState> {
  return {
    highlightedCells: [],
    draggingPlayer: null,
    highlightDiscardPile: false
  };
}
// Move generation helpers

// Updated getFirstMoveBoardMoves to randomly select a card from the player's hand for the first move
const getFirstMoveBoardMoves = (
  playerId: PlayerEnum,
  player: Players[PlayerEnum],
  board: BoardState,
  isTieBreaker: boolean
): Move[] => {
  const validHandIndices = player.hand
    .map((card, idx) => (card ? idx : -1))
    .filter(idx => idx !== -1);
  if (validHandIndices.length === 0) return [];
  const randomIndex = validHandIndices[Math.floor(Math.random() * validHandIndices.length)];
  const card = player.hand[randomIndex]!;
  const validIndices = getValidFirstMoveIndices(playerId, card, board, isTieBreaker);
  return validIndices.map(cellIndex => ({
    type: DestinationEnum.BOARD,
    cellIndex,
    cardIndex: randomIndex,
  }));
};

const getValidFirstMoveIndices = (
  playerId: PlayerEnum,
  card: Card,
  board: BoardState,
  isTieBreaker: boolean
): CellIndices => {
  return isTieBreaker
    ? getValidMoveIndices(getHomeRowIndices(playerId, BOARD_SIZE), board, card)
    : [STARTING_INDICES[playerId]];
};

const getRegularMovesForCard = (
  playerId: PlayerEnum,
  card: Card,
  cardIndex: CardIndex,
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
): CellIndices => {
  if (isTieBreaker) {
    return getValidMoveIndices(getHomeRowIndices(playerId, BOARD_SIZE), board, card);
  }
  return getValidMovesHelper(playerId, card, board, isTieBreaker, false);
};

const createBoardMoveWithIndex = (cellIndex: CellIndex, cardIndex: CardIndex): Move => ({
  type: DestinationEnum.BOARD,
  cellIndex,
  cardIndex,
});

const getDiscardMovesIfAllowed = (cardIndex: CardIndex, isTieBreaker: boolean): Move[] => {
  return !isTieBreaker ? [{ type: DestinationEnum.DISCARD, cardIndex }] : [];
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

const canProcessTurn = (state: GameState, playerId: PlayerEnum): boolean => {
  return !state.gameStatus.gameOver && state.turn.currentTurn === playerId;
};

const getNextMove = (state: GameState, playerId: PlayerEnum): Move | null => {
  const moves = state.gameStatus.firstMove[playerId]
    ? getFirstMoveBoardMoves(playerId, state.players[playerId], state.board, state.gameStatus.tieBreaker)
    : getRegularMoves(playerId, state.players[playerId], state.board, state.gameStatus.tieBreaker);
  return selectRandomMove(moves);
};

const canFlipInitialCards = (state: GameState): boolean => {
  const faceDown = state.gameStatus.initialFaceDownCards;
  return !!(faceDown[PlayerEnum.PLAYER1] && faceDown[PlayerEnum.PLAYER2]);
};

const getValidMovesHelper = (
  playerId: PlayerEnum,
  card: Card,
  board: BoardState,
  isTieBreaker: boolean,
  isFirstMove: boolean
): CellIndices => {
  if (isTieBreaker) {
    // During tie breaker, only allow moves in the player's home row
    const homeRow = getHomeRowIndices(playerId, BOARD_SIZE);
    return homeRow.filter(i => {
      const cell = board[i];
      if (!cell || cell.length === 0) return true;
      const topCard = cell[cell.length - 1];
      return !topCard || getCardRank(card.rank) > getCardRank(topCard.rank);
    });
  }

  if (isFirstMove) {
    return [STARTING_INDICES[playerId]];
  }

  // For regular moves, get valid moves from both home row and connected cells
  const homeRow = getHomeRowIndices(playerId, BOARD_SIZE);
  const connectedCells = findConnectedCells(playerId, board, card.color, BOARD_SIZE);
  
  // Get all adjacent cells to both home row and connected cells
  const adjacentToHome = homeRow.flatMap(index => getAdjacentIndices(index, BOARD_SIZE));
  const adjacentToConnected = Array.from(connectedCells).flatMap(index => getAdjacentIndices(index, BOARD_SIZE));
  
  // Combine all possible valid cells and remove duplicates
  const allPossibleCells = Array.from(new Set([...homeRow, ...adjacentToHome, ...adjacentToConnected]));
  
  return getValidMoveIndices(allPossibleCells, board, card);
};

