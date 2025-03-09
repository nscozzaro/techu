import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  GameState,
  moveCard,
  flipInitialCards,
  processTurn,
  calculateScores,
  isGameOver,
  getValidMoves,
  setTieBreaker
} from './game';
import {
  PlayerEnum,
  ColorEnum,
  Card,
  DestinationEnum,
  BoardState,
  Players,
  BOARD_SIZE,
  STARTING_INDICES,
  SuitEnum,
  RankEnum,
  Cards,
  CellIndex,
  Player
} from '../types';

type Store = ReturnType<typeof configureStore<{
  game: ReturnType<typeof gameReducer>;
}>>;

// Test factories and helpers
const TestFactory = {
  card: (params: Partial<Card> = {}): Card => ({
    color: ColorEnum.BLACK,
    suit: SuitEnum.SPADES,
    rank: RankEnum.KING,
    owner: PlayerEnum.PLAYER2,
    faceDown: false,
    ...params
  }),

  board: (cells: { [index: number]: Partial<Card>[] } = {}): BoardState => {
    // Create a mutable board with empty arrays
    const board = Array(BOARD_SIZE * BOARD_SIZE).fill(null).map(() => [] as Cards);
    
    // Fill in the specified cells
    Object.entries(cells).forEach(([index, cards]) => {
      board[Number(index)] = cards.map(card => TestFactory.card(card));
    });
    
    return board;
  },

  players: (params: Partial<Record<PlayerEnum, Partial<Player>>> = {}): Players => ({
    [PlayerEnum.PLAYER1]: {
      hand: [null, null, null],
      deck: [],
      id: PlayerEnum.PLAYER1,
      ...params[PlayerEnum.PLAYER1]
    },
    [PlayerEnum.PLAYER2]: {
      hand: [null, null, null],
      deck: [],
      id: PlayerEnum.PLAYER2,
      ...params[PlayerEnum.PLAYER2]
    }
  }),

  connectedBoard: (params: {
    homeRowIndex: number;
    playerColor: ColorEnum;
    playerId: PlayerEnum;
    cards: Array<{
      index: number;
      rank: RankEnum;
      isConnected?: boolean;
    }>;
  }) => {
    const cells: { [index: number]: Partial<Card>[] } = {
      [params.homeRowIndex]: [{
        color: params.playerColor,
        suit: params.playerColor === ColorEnum.RED ? SuitEnum.HEARTS : SuitEnum.SPADES,
        rank: RankEnum.KING,
        owner: params.playerId
      }]
    };

    params.cards.forEach(card => {
      cells[card.index] = [{
        color: params.playerColor,
        suit: params.playerColor === ColorEnum.RED ? SuitEnum.HEARTS : SuitEnum.SPADES,
        rank: card.rank,
        owner: params.playerId
      }];
    });

    return TestFactory.board(cells);
  }
};

interface TestHelpers {
  setupStore: (params?: {
    board?: BoardState;
    players?: Players;
    firstMoveDone?: boolean;
  }) => Store;
  playInitialMoves: (store: Store) => Store;
  checkValidMoves: (store: Store, params: {
    playerId: PlayerEnum;
    card: Card;
    validCells: number[];
    invalidCells: number[];
  }) => void;
}

const TestHelpers: TestHelpers = {
  setupStore: (params = {}) => {
    const store = configureStore({
      reducer: {
        game: gameReducer
      },
      preloadedState: params.board || params.players ? {
        game: {
          ...gameReducer(undefined, { type: 'INIT' }),
          ...(params.board ? { board: params.board } : {}),
          ...(params.players ? { players: params.players } : {}),
          gameStatus: {
            ...gameReducer(undefined, { type: 'INIT' }).gameStatus,
            firstMove: {
              [PlayerEnum.PLAYER1]: !params.firstMoveDone,
              [PlayerEnum.PLAYER2]: !params.firstMoveDone
            }
          }
        }
      } : undefined
    });
    return store;
  },

  playInitialMoves: (store) => {
    store.dispatch(moveCard({
      cardIndex: 0,
      playerId: PlayerEnum.PLAYER1,
      destination: DestinationEnum.BOARD,
      boardIndex: STARTING_INDICES[PlayerEnum.PLAYER1]
    }));

    store.dispatch(moveCard({
      cardIndex: 0,
      playerId: PlayerEnum.PLAYER2,
      destination: DestinationEnum.BOARD,
      boardIndex: STARTING_INDICES[PlayerEnum.PLAYER2]
    }));

    store.dispatch(flipInitialCards());
    return store;
  },

  checkValidMoves: (store, params) => {
    store.dispatch(getValidMoves({ playerId: params.playerId, card: params.card }));
    const state = store.getState().game;
    
    params.validCells.forEach(cell => {
      expect(state.highlightedCells).toContain(cell);
    });
    
    params.invalidCells.forEach(cell => {
      expect(state.highlightedCells).not.toContain(cell);
    });
  }
};

describe('Game Integration Tests', () => {
  let store: ReturnType<typeof TestHelpers.setupStore>;

  beforeEach(() => {
    store = TestHelpers.setupStore();
  });

  describe('Game Initialization', () => {
    it('should initialize game with correct state', () => {
      const state = store.getState().game;
      
      expect(state.board).toHaveLength(BOARD_SIZE * BOARD_SIZE);
      expect(state.board.every((cell: Cards) => Array.isArray(cell) && cell.length === 0)).toBe(true);
      expect(state.players[PlayerEnum.PLAYER1].hand).toHaveLength(3);
      expect(state.players[PlayerEnum.PLAYER2].hand).toHaveLength(3);
      expect(state.players[PlayerEnum.PLAYER1].deck.length).toBeGreaterThan(0);
      expect(state.players[PlayerEnum.PLAYER2].deck.length).toBeGreaterThan(0);
      expect(state.turn.currentTurn).toBe(PlayerEnum.PLAYER1);
      expect(state.gameStatus.gameOver).toBe(false);
      expect(state.gameStatus.tieBreaker).toBe(false);
      expect(state.gameStatus.firstMove[PlayerEnum.PLAYER1]).toBe(true);
      expect(state.gameStatus.firstMove[PlayerEnum.PLAYER2]).toBe(true);
    });
  });

  describe('Card Ranking Rules', () => {
    it('should enforce card ranking rules', () => {
      const homeRowIndex = 2;
      const targetIndex = homeRowIndex + BOARD_SIZE;
      
      store = TestHelpers.setupStore({
        board: TestFactory.connectedBoard({
          homeRowIndex,
          playerColor: ColorEnum.BLACK,
          playerId: PlayerEnum.PLAYER2,
          cards: [
            { index: targetIndex, rank: RankEnum.FIVE },
            { index: targetIndex + 1, rank: RankEnum.KING },
            { index: targetIndex + 2, rank: RankEnum.KING }
          ]
        }),
        firstMoveDone: true
      });

      // Test higher card can capture lower card
      TestHelpers.checkValidMoves(store, {
        playerId: PlayerEnum.PLAYER2,
        card: TestFactory.card({ rank: RankEnum.KING }),
        validCells: [targetIndex],
        invalidCells: []
      });

      // Test lower card cannot capture higher card
      TestHelpers.checkValidMoves(store, {
        playerId: PlayerEnum.PLAYER2,
        card: TestFactory.card({ rank: RankEnum.THREE }),
        validCells: [],
        invalidCells: [targetIndex]
      });

      // Test Ace is highest ranked
      TestHelpers.checkValidMoves(store, {
        playerId: PlayerEnum.PLAYER2,
        card: TestFactory.card({ rank: RankEnum.ACE }),
        validCells: [targetIndex, targetIndex + 1],
        invalidCells: []
      });

      // Test same rank cannot capture
      TestHelpers.checkValidMoves(store, {
        playerId: PlayerEnum.PLAYER2,
        card: TestFactory.card({ rank: RankEnum.KING }),
        validCells: [targetIndex],
        invalidCells: [targetIndex + 1, targetIndex + 2]
      });
    });
  });

  describe('Home Row Connection Rule', () => {
    it('should enforce connection rules', () => {
      const homeRowIndex = 2;
      const connectedIndex = homeRowIndex + BOARD_SIZE;
      const disconnectedIndex = 22;
      
      store = TestHelpers.setupStore({
        board: TestFactory.connectedBoard({
          homeRowIndex,
          playerColor: ColorEnum.BLACK,
          playerId: PlayerEnum.PLAYER2,
          cards: [
            { index: connectedIndex, rank: RankEnum.QUEEN },
            { index: disconnectedIndex, rank: RankEnum.JACK }
          ]
        }),
        firstMoveDone: true
      });

      const validCells = [
        homeRowIndex - 1,
        homeRowIndex + 1,
        connectedIndex + BOARD_SIZE,
        connectedIndex + 1,
        connectedIndex - 1,
        connectedIndex - BOARD_SIZE
      ];

      const invalidCells = [
        disconnectedIndex + BOARD_SIZE,
        disconnectedIndex - BOARD_SIZE,
        disconnectedIndex + 1,
        disconnectedIndex - 1,
        connectedIndex + BOARD_SIZE + 1,
        connectedIndex + BOARD_SIZE - 1
      ];

      TestHelpers.checkValidMoves(store, {
        playerId: PlayerEnum.PLAYER2,
        card: TestFactory.card({ rank: RankEnum.ACE }),
        validCells,
        invalidCells
      });
    });
  });

  describe('Game Flow', () => {
    it('should handle game flow correctly', () => {
      // Test initial moves
      store = TestHelpers.playInitialMoves(store);
      const stateAfterSetup = store.getState().game;
      expect(stateAfterSetup.players[PlayerEnum.PLAYER1].hand).toHaveLength(3);
      expect(stateAfterSetup.players[PlayerEnum.PLAYER2].hand).toHaveLength(3);

      // Test discard
      const currentPlayer = stateAfterSetup.turn.currentTurn;
      const initialDiscardSize = stateAfterSetup.discard[currentPlayer].length;
      
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: currentPlayer,
        destination: DestinationEnum.DISCARD
      }));

      const stateAfterDiscard = store.getState().game;
      expect(stateAfterDiscard.discard[currentPlayer].length).toBe(initialDiscardSize + 1);
      expect(stateAfterDiscard.turn.currentTurn).not.toBe(currentPlayer);
    });
  });

  describe('Game End Conditions', () => {
    it('should handle game end correctly', () => {
      // Test game over detection
      expect(isGameOver(TestFactory.players())).toBe(true);

      // Test score calculation
      const finalBoard = TestFactory.board({
        0: [{ color: ColorEnum.RED, owner: PlayerEnum.PLAYER1 }],
        1: [{ color: ColorEnum.BLACK, owner: PlayerEnum.PLAYER2 }],
        2: [{ color: ColorEnum.RED, owner: PlayerEnum.PLAYER1 }]
      });

      const scores = calculateScores(finalBoard);
      expect(scores[PlayerEnum.PLAYER1]).toBe(2);
      expect(scores[PlayerEnum.PLAYER2]).toBe(1);
    });

    it('should determine winner based on controlled spaces', () => {
      const winningBoard = TestFactory.board({
        0: [{ color: ColorEnum.RED, owner: PlayerEnum.PLAYER1 }],
        1: [{ color: ColorEnum.RED, owner: PlayerEnum.PLAYER1 }],
        2: [{ color: ColorEnum.RED, owner: PlayerEnum.PLAYER1 }],
        3: [{ color: ColorEnum.BLACK, owner: PlayerEnum.PLAYER2 }]
      });

      const scores = calculateScores(winningBoard);
      expect(scores[PlayerEnum.PLAYER1]).toBeGreaterThan(scores[PlayerEnum.PLAYER2]);
    });
  });

  describe('Tie Breaker Mechanics', () => {
    it('should handle tie breaker when initial cards have same rank', () => {
      // Setup store with initial board state
      const player1StartIndex = STARTING_INDICES[PlayerEnum.PLAYER1];
      const player2StartIndex = STARTING_INDICES[PlayerEnum.PLAYER2];
      
      const initialBoard = TestFactory.board();
      initialBoard[player1StartIndex] = [];
      initialBoard[player2StartIndex] = [];
      
      store = TestHelpers.setupStore({
        board: initialBoard,
        players: TestFactory.players({
          [PlayerEnum.PLAYER1]: {
            hand: [TestFactory.card({
              color: ColorEnum.RED,
              suit: SuitEnum.HEARTS,
              rank: RankEnum.KING,
              owner: PlayerEnum.PLAYER1,
              faceDown: true
            }), null, null],
            deck: []
          },
          [PlayerEnum.PLAYER2]: {
            hand: [TestFactory.card({
              color: ColorEnum.BLACK,
              suit: SuitEnum.SPADES,
              rank: RankEnum.KING,
              owner: PlayerEnum.PLAYER2,
              faceDown: true
            }), null, null],
            deck: []
          }
        })
      });

      // Make initial moves
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1,
        destination: DestinationEnum.BOARD,
        boardIndex: player1StartIndex
      }));

      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER2,
        destination: DestinationEnum.BOARD,
        boardIndex: player2StartIndex
      }));

      // Set tie breaker and flip cards
      store.dispatch(setTieBreaker(true));
      store.dispatch(flipInitialCards());
      
      const state = store.getState().game;
      
      // Verify tie breaker state
      const player1Card = state.board[player1StartIndex][0];
      const player2Card = state.board[player2StartIndex][0];
      
      expect(player1Card?.faceDown).toBe(false);
      expect(player2Card?.faceDown).toBe(false);
      expect(state.gameStatus.tieBreaker).toBe(true);
    });
  });

  describe('Extended Game Flow', () => {
    it('should maintain hand size and draw new cards after playing', () => {
      const player1StartIndex = STARTING_INDICES[PlayerEnum.PLAYER1];
      const player2StartIndex = STARTING_INDICES[PlayerEnum.PLAYER2];
      
      const initialBoard = TestFactory.board();
      initialBoard[player1StartIndex] = [];
      initialBoard[player2StartIndex] = [];
      
      // Setup initial state with cards in deck
      store = TestHelpers.setupStore({
        board: initialBoard,
        players: TestFactory.players({
          [PlayerEnum.PLAYER1]: {
            hand: [TestFactory.card({
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1,
              rank: RankEnum.KING,
              faceDown: true
            }), null, null],
            deck: [
              TestFactory.card({ color: ColorEnum.RED, owner: PlayerEnum.PLAYER1, rank: RankEnum.QUEEN }),
              TestFactory.card({ color: ColorEnum.RED, owner: PlayerEnum.PLAYER1, rank: RankEnum.JACK })
            ]
          },
          [PlayerEnum.PLAYER2]: {
            hand: [TestFactory.card({
              color: ColorEnum.BLACK,
              owner: PlayerEnum.PLAYER2,
              rank: RankEnum.KING,
              faceDown: true
            }), null, null],
            deck: []
          }
        })
      });

      // Play initial moves
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1,
        destination: DestinationEnum.BOARD,
        boardIndex: player1StartIndex
      }));

      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER2,
        destination: DestinationEnum.BOARD,
        boardIndex: player2StartIndex
      }));

      store.dispatch(flipInitialCards());

      const state = store.getState().game;
      const currentPlayer = state.turn.currentTurn;
      const initialHand = [...state.players[currentPlayer].hand];
      const initialDeckSize = state.players[currentPlayer].deck.length;

      // Play a card
      const targetIndex = player1StartIndex + BOARD_SIZE;
      initialBoard[targetIndex] = []; // Initialize the target cell
      
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: currentPlayer,
        destination: DestinationEnum.BOARD,
        boardIndex: targetIndex
      }));

      const stateAfterMove = store.getState().game;
      
      // Check hand maintenance
      expect(stateAfterMove.players[currentPlayer].hand).toHaveLength(3);
      expect(stateAfterMove.players[currentPlayer].hand[0]).not.toEqual(initialHand[0]);
      expect(stateAfterMove.players[currentPlayer].deck.length).toBe(initialDeckSize - 1);
    });

    it('should alternate turns after valid moves', () => {
      const player1StartIndex = STARTING_INDICES[PlayerEnum.PLAYER1];
      const player2StartIndex = STARTING_INDICES[PlayerEnum.PLAYER2];
      
      const initialBoard = TestFactory.board();
      initialBoard[player1StartIndex] = [];
      initialBoard[player2StartIndex] = [];
      
      // Initialize with empty board first
      store = TestHelpers.setupStore({
        board: initialBoard,
        players: TestFactory.players({
          [PlayerEnum.PLAYER1]: {
            hand: [TestFactory.card({
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1,
              rank: RankEnum.ACE,
              faceDown: true
            }), null, null],
            deck: []
          },
          [PlayerEnum.PLAYER2]: {
            hand: [TestFactory.card({
              color: ColorEnum.BLACK,
              owner: PlayerEnum.PLAYER2,
              rank: RankEnum.ACE,
              faceDown: true
            }), null, null],
            deck: []
          }
        })
      });

      // Play initial moves
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1,
        destination: DestinationEnum.BOARD,
        boardIndex: player1StartIndex
      }));

      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER2,
        destination: DestinationEnum.BOARD,
        boardIndex: player2StartIndex
      }));

      store.dispatch(flipInitialCards());

      // Initialize target cells for next moves
      const player1TargetIndex = player1StartIndex + BOARD_SIZE;
      const player2TargetIndex = player2StartIndex + BOARD_SIZE;
      initialBoard[player1TargetIndex] = [];
      initialBoard[player2TargetIndex] = [];

      // Give players new cards for next moves
      store = TestHelpers.setupStore({
        board: initialBoard,
        players: TestFactory.players({
          [PlayerEnum.PLAYER1]: {
            hand: [TestFactory.card({
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1,
              rank: RankEnum.KING
            }), null, null],
            deck: []
          },
          [PlayerEnum.PLAYER2]: {
            hand: [TestFactory.card({
              color: ColorEnum.BLACK,
              owner: PlayerEnum.PLAYER2,
              rank: RankEnum.KING
            }), null, null],
            deck: []
          }
        }),
        firstMoveDone: true
      });

      const state = store.getState().game;
      const initialPlayer = state.turn.currentTurn;

      // Make a valid move for first player
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: initialPlayer,
        destination: DestinationEnum.BOARD,
        boardIndex: player1TargetIndex
      }));

      const stateAfterMove = store.getState().game;
      expect(stateAfterMove.turn.currentTurn).not.toBe(initialPlayer);

      // Make a valid move for second player
      const secondPlayer = stateAfterMove.turn.currentTurn;
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: secondPlayer,
        destination: DestinationEnum.BOARD,
        boardIndex: player2TargetIndex
      }));

      const stateAfterSecondMove = store.getState().game;
      expect(stateAfterSecondMove.turn.currentTurn).toBe(initialPlayer);
    });

    it('should handle discarding when no valid moves available', () => {
      // Setup with cards that have no valid moves
      store = TestHelpers.setupStore({
        players: TestFactory.players({
          [PlayerEnum.PLAYER1]: {
            hand: [TestFactory.card({
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1,
              rank: RankEnum.TWO
            }), null, null],
            deck: [TestFactory.card({ color: ColorEnum.RED, owner: PlayerEnum.PLAYER1 })]
          }
        })
      });

      store = TestHelpers.playInitialMoves(store);
      const state = store.getState().game;
      const currentPlayer = state.turn.currentTurn;
      const initialDiscardSize = state.discard[currentPlayer].length;
      const initialHand = [...state.players[currentPlayer].hand];

      // Discard a card
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: currentPlayer,
        destination: DestinationEnum.DISCARD
      }));

      const stateAfterDiscard = store.getState().game;
      
      // Check discard results
      expect(stateAfterDiscard.discard[currentPlayer].length).toBe(initialDiscardSize + 1);
      expect(stateAfterDiscard.players[currentPlayer].hand[0]).not.toEqual(initialHand[0]);
      expect(stateAfterDiscard.turn.currentTurn).not.toBe(currentPlayer);
    });
  });
}); 