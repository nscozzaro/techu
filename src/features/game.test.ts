import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  GameState,
  moveCard,
  flipInitialCards,
  processTurn,
  calculateScores,
  isGameOver,
  getValidMoves,
  setTieBreaker,
  startCardDrag,
  setTurn
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
  Player,
  CellIndices,
  rankOrder
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

// Helper functions for tests
const getHomeRowIndices = (playerId: PlayerEnum, boardSize: number): CellIndices => {
  const rowStart = playerId === PlayerEnum.PLAYER1 ? boardSize - 1 : 0;
  return Array.from({ length: boardSize }, (_, i) => rowStart * boardSize + i);
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

    it('should maintain tie breaker state when equal cards are played during tie breaker', () => {
      // Setup store with initial board state
      const player1StartIndex = STARTING_INDICES[PlayerEnum.PLAYER1];
      const player2StartIndex = STARTING_INDICES[PlayerEnum.PLAYER2];
      
      const initialBoard = TestFactory.board();
      initialBoard[player1StartIndex] = [];
      initialBoard[player2StartIndex] = [];
      
      // Setup initial state with Kings for first move and Queens for second move
      store = TestHelpers.setupStore({
        board: initialBoard,
        players: TestFactory.players({
          [PlayerEnum.PLAYER1]: {
            hand: [
              TestFactory.card({
                color: ColorEnum.RED,
                suit: SuitEnum.HEARTS,
                rank: RankEnum.KING,
                owner: PlayerEnum.PLAYER1,
                faceDown: true
              }),
              TestFactory.card({
                color: ColorEnum.RED,
                suit: SuitEnum.HEARTS,
                rank: RankEnum.QUEEN,
                owner: PlayerEnum.PLAYER1
              }),
              null
            ],
            deck: []
          },
          [PlayerEnum.PLAYER2]: {
            hand: [
              TestFactory.card({
                color: ColorEnum.BLACK,
                suit: SuitEnum.SPADES,
                rank: RankEnum.KING,
                owner: PlayerEnum.PLAYER2,
                faceDown: true
              }),
              TestFactory.card({
                color: ColorEnum.BLACK,
                suit: SuitEnum.SPADES,
                rank: RankEnum.QUEEN,
                owner: PlayerEnum.PLAYER2
              }),
              null
            ],
            deck: []
          }
        })
      });

      // Make initial moves with Kings
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

      // Set tie breaker and flip initial Kings
      store.dispatch(setTieBreaker(true));
      store.dispatch(flipInitialCards());
      
      const stateAfterFirstMoves = store.getState().game;
      expect(stateAfterFirstMoves.gameStatus.tieBreaker).toBe(true);

      // Get home row indices for second moves
      const player1HomeRow = getHomeRowIndices(PlayerEnum.PLAYER1, BOARD_SIZE);
      const player2HomeRow = getHomeRowIndices(PlayerEnum.PLAYER2, BOARD_SIZE);
      const player1SecondMoveIndex = player1HomeRow[1]; // Use second position in home row
      const player2SecondMoveIndex = player2HomeRow[1]; // Use second position in home row

      // Make second moves with Queens during tie breaker
      store.dispatch(moveCard({
        cardIndex: 1, // Queens are in second position of hand
        playerId: PlayerEnum.PLAYER1,
        destination: DestinationEnum.BOARD,
        boardIndex: player1SecondMoveIndex
      }));

      store.dispatch(moveCard({
        cardIndex: 1,
        playerId: PlayerEnum.PLAYER2,
        destination: DestinationEnum.BOARD,
        boardIndex: player2SecondMoveIndex
      }));

      const finalState = store.getState().game;

      // Verify tie breaker state is maintained
      expect(finalState.gameStatus.tieBreaker).toBe(true);

      // Verify cards were placed in home rows
      const player1SecondCard = finalState.board[player1SecondMoveIndex][0];
      const player2SecondCard = finalState.board[player2SecondMoveIndex][0];
      expect(player1SecondCard?.rank).toBe(RankEnum.QUEEN);
      expect(player2SecondCard?.rank).toBe(RankEnum.QUEEN);

      // Verify cards are face up
      expect(player1SecondCard?.faceDown).toBe(false);
      expect(player2SecondCard?.faceDown).toBe(false);

      // Verify valid moves are restricted to home row during tie breaker
      const testCard = TestFactory.card({ rank: RankEnum.THREE });
      
      // During tie breaker, valid moves are cells in the home row where the card can be played
      // according to ranking rules (can only capture lower ranked cards or empty cells)
      const homeRowIndices = getHomeRowIndices(PlayerEnum.PLAYER1, BOARD_SIZE);
      const validCells = homeRowIndices.filter(i => {
        const cell = finalState.board[i];
        const topCard = cell[cell.length - 1];
        // Can play on empty cells or cells where our card's rank is higher
        return !topCard || rankOrder[testCard.rank] > rankOrder[topCard.rank];
      });
      
      const invalidCells = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => i)
        .filter(i => !validCells.includes(i));
      
      // Use TestHelpers.checkValidMoves to verify valid moves
      TestHelpers.checkValidMoves(store, {
        playerId: PlayerEnum.PLAYER1,
        card: testCard,
        validCells,
        invalidCells
      });

      // Check that no discard moves are allowed
      expect(finalState.highlightDiscardPile).toBe(false);
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

  describe('Tiebreaker Logic', () => {
    it('should maintain Player 2 turn after double tie', () => {
      // Setup initial board with a 6 from each player
      const board = TestFactory.board({
        12: [TestFactory.card({
          rank: RankEnum.SIX,
          color: ColorEnum.RED,
          owner: PlayerEnum.PLAYER1
        })],
        13: [TestFactory.card({
          rank: RankEnum.SIX,
          color: ColorEnum.BLACK,
          owner: PlayerEnum.PLAYER2
        })]
      });

      // Setup players with Aces in their hands
      const players = TestFactory.players({
        [PlayerEnum.PLAYER1]: {
          hand: [
            TestFactory.card({
              rank: RankEnum.ACE,
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1
            }),
            null,
            null
          ]
        },
        [PlayerEnum.PLAYER2]: {
          hand: [
            TestFactory.card({
              rank: RankEnum.ACE,
              color: ColorEnum.BLACK,
              owner: PlayerEnum.PLAYER2
            }),
            null,
            null
          ]
        }
      });

      // Initialize store with tiebreaker state
      const store = TestHelpers.setupStore({
        board,
        players,
        firstMoveDone: true
      });

      // Set tiebreaker state
      store.dispatch(setTieBreaker(true));

      // Player 1 plays Ace
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1,
        destination: DestinationEnum.BOARD,
        boardIndex: 14
      }));

      // Player 2 plays Ace
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER2,
        destination: DestinationEnum.BOARD,
        boardIndex: 15
      }));

      // After both players play Aces, it should still be Player 2's turn
      const finalState = store.getState().game;
      expect(finalState.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
      expect(finalState.gameStatus.tieBreaker).toBe(true);
    });
  });

  describe('Tiebreaker Logic with Drag and Drop', () => {
    it('should maintain Player 2 turn after double tie with drag and drop', () => {
      // Setup initial board with a 6 from each player
      const board = TestFactory.board({
        12: [TestFactory.card({
          rank: RankEnum.SIX,
          color: ColorEnum.RED,
          owner: PlayerEnum.PLAYER1
        })],
        13: [TestFactory.card({
          rank: RankEnum.SIX,
          color: ColorEnum.BLACK,
          owner: PlayerEnum.PLAYER2
        })]
      });

      // Setup players with Aces in their hands
      const players = TestFactory.players({
        [PlayerEnum.PLAYER1]: {
          hand: [
            TestFactory.card({
              rank: RankEnum.ACE,
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1
            }),
            null,
            null
          ]
        },
        [PlayerEnum.PLAYER2]: {
          hand: [
            TestFactory.card({
              rank: RankEnum.ACE,
              color: ColorEnum.BLACK,
              owner: PlayerEnum.PLAYER2
            }),
            null,
            null
          ]
        }
      });

      // Initialize store with tiebreaker state
      const store = TestHelpers.setupStore({
        board,
        players,
        firstMoveDone: true
      });

      // Set tiebreaker state
      store.dispatch(setTieBreaker(true));

      // Simulate Player 1 starting to drag their Ace
      store.dispatch(startCardDrag({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1
      }));

      // Simulate Player 1 dropping their Ace
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1,
        destination: DestinationEnum.BOARD,
        boardIndex: 14
      }));

      // Get state after Player 1's move
      const stateAfterPlayer1 = store.getState().game;
      expect(stateAfterPlayer1.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
      expect(stateAfterPlayer1.gameStatus.tieBreaker).toBe(true);

      // Simulate Player 2 starting to drag their Ace
      store.dispatch(startCardDrag({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER2
      }));

      // Simulate Player 2 dropping their Ace
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER2,
        destination: DestinationEnum.BOARD,
        boardIndex: 15
      }));

      // After both players play Aces, it should still be Player 2's turn
      const finalState = store.getState().game;
      expect(finalState.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
      expect(finalState.gameStatus.tieBreaker).toBe(true);

      // Verify that Player 1 cannot make another move
      store.dispatch(startCardDrag({
        cardIndex: 1,
        playerId: PlayerEnum.PLAYER1
      }));

      const stateAfterInvalidMove = store.getState().game;
      expect(stateAfterInvalidMove.highlightedCells).toEqual([]);
      expect(stateAfterInvalidMove.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
    });
  });

  describe('Tiebreaker Logic with Full Sequence', () => {
    it('should maintain tiebreaker state and prevent Player 1 from playing after double tie', () => {
      // Setup initial board with a 6 from each player
      const board = TestFactory.board({
        12: [TestFactory.card({
          rank: RankEnum.SIX,
          color: ColorEnum.RED,
          owner: PlayerEnum.PLAYER1
        })],
        13: [TestFactory.card({
          rank: RankEnum.SIX,
          color: ColorEnum.BLACK,
          owner: PlayerEnum.PLAYER2
        })]
      });

      // Setup players with Aces and Kings in their hands
      const players = TestFactory.players({
        [PlayerEnum.PLAYER1]: {
          hand: [
            TestFactory.card({
              rank: RankEnum.ACE,
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1
            }),
            TestFactory.card({
              rank: RankEnum.KING,
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1
            }),
            null
          ]
        },
        [PlayerEnum.PLAYER2]: {
          hand: [
            TestFactory.card({
              rank: RankEnum.ACE,
              color: ColorEnum.BLACK,
              owner: PlayerEnum.PLAYER2
            }),
            TestFactory.card({
              rank: RankEnum.KING,
              color: ColorEnum.BLACK,
              owner: PlayerEnum.PLAYER2
            }),
            null
          ]
        }
      });

      // Initialize store with tiebreaker state
      const store = TestHelpers.setupStore({
        board,
        players,
        firstMoveDone: true
      });

      // Set tiebreaker state
      store.dispatch(setTieBreaker(true));

      // Simulate Player 1 starting to drag their Ace
      store.dispatch(startCardDrag({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1
      }));

      // Simulate Player 1 dropping their Ace
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1,
        destination: DestinationEnum.BOARD,
        boardIndex: 14
      }));

      // Get state after Player 1's move
      const stateAfterPlayer1 = store.getState().game;
      expect(stateAfterPlayer1.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
      expect(stateAfterPlayer1.gameStatus.tieBreaker).toBe(true);

      // Simulate Player 2 starting to drag their Ace
      store.dispatch(startCardDrag({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER2
      }));

      // Simulate Player 2 dropping their Ace
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER2,
        destination: DestinationEnum.BOARD,
        boardIndex: 15
      }));

      // After both players play Aces, it should still be Player 2's turn
      const stateAfterAces = store.getState().game;
      expect(stateAfterAces.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
      expect(stateAfterAces.gameStatus.tieBreaker).toBe(true);

      // Verify that Player 1 cannot make a move
      store.dispatch(startCardDrag({
        cardIndex: 1,
        playerId: PlayerEnum.PLAYER1
      }));

      const stateAfterInvalidMove = store.getState().game;
      expect(stateAfterInvalidMove.highlightedCells).toEqual([]);
      expect(stateAfterInvalidMove.turn.currentTurn).toBe(PlayerEnum.PLAYER2);

      // Verify that Player 2 can make a move
      store.dispatch(startCardDrag({
        cardIndex: 1,
        playerId: PlayerEnum.PLAYER2
      }));

      const stateAfterValidMove = store.getState().game;
      expect(stateAfterValidMove.highlightedCells.length).toBeGreaterThan(0);
      expect(stateAfterValidMove.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
    });
  });

  describe('Tiebreaker Logic with Card Dragging', () => {
    it('should prevent Player 1 from seeing valid moves during Player 2 tiebreaker turn', () => {
      // Setup initial board with tied cards
      const board = TestFactory.board({
        12: [TestFactory.card({
          rank: RankEnum.SIX,
          color: ColorEnum.RED,
          owner: PlayerEnum.PLAYER1
        })],
        13: [TestFactory.card({
          rank: RankEnum.SIX,
          color: ColorEnum.BLACK,
          owner: PlayerEnum.PLAYER2
        })]
      });

      // Setup players with cards in hand
      const players = TestFactory.players({
        [PlayerEnum.PLAYER1]: {
          hand: [
            TestFactory.card({
              rank: RankEnum.KING,
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1
            }),
            TestFactory.card({
              rank: RankEnum.QUEEN,
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1
            }),
            null
          ]
        },
        [PlayerEnum.PLAYER2]: {
          hand: [
            TestFactory.card({
              rank: RankEnum.KING,
              color: ColorEnum.BLACK,
              owner: PlayerEnum.PLAYER2
            }),
            TestFactory.card({
              rank: RankEnum.QUEEN,
              color: ColorEnum.BLACK,
              owner: PlayerEnum.PLAYER2
            }),
            null
          ]
        }
      });

      // Initialize store with tiebreaker state
      const store = TestHelpers.setupStore({
        board,
        players,
        firstMoveDone: true
      });

      // Set tiebreaker state and Player 2's turn
      store.dispatch(setTieBreaker(true));
      store.dispatch(setTurn(PlayerEnum.PLAYER2));

      // Player 1 attempts to drag a card during Player 2's turn
      store.dispatch(startCardDrag({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1
      }));

      // Verify no valid moves are shown for Player 1
      const stateAfterPlayer1Drag = store.getState().game;
      expect(stateAfterPlayer1Drag.highlightedCells).toEqual([]);
      expect(stateAfterPlayer1Drag.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
      expect(stateAfterPlayer1Drag.gameStatus.tieBreaker).toBe(true);

      // Player 2 attempts to drag a card during their turn
      store.dispatch(startCardDrag({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER2
      }));

      // Verify valid moves are shown for Player 2
      const stateAfterPlayer2Drag = store.getState().game;
      expect(stateAfterPlayer2Drag.highlightedCells.length).toBeGreaterThan(0);
      expect(stateAfterPlayer2Drag.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
      expect(stateAfterPlayer2Drag.gameStatus.tieBreaker).toBe(true);
    });

    it('should maintain tiebreaker state through multiple tied plays', () => {
      // Setup initial board
      const board = TestFactory.board({
        12: [TestFactory.card({
          rank: RankEnum.SIX,
          color: ColorEnum.RED,
          owner: PlayerEnum.PLAYER1
        })],
        13: [TestFactory.card({
          rank: RankEnum.SIX,
          color: ColorEnum.BLACK,
          owner: PlayerEnum.PLAYER2
        })]
      });

      // Setup players with multiple tied cards
      const players = TestFactory.players({
        [PlayerEnum.PLAYER1]: {
          hand: [
            TestFactory.card({
              rank: RankEnum.KING,
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1
            }),
            TestFactory.card({
              rank: RankEnum.QUEEN,
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1
            }),
            null
          ]
        },
        [PlayerEnum.PLAYER2]: {
          hand: [
            TestFactory.card({
              rank: RankEnum.KING,
              color: ColorEnum.BLACK,
              owner: PlayerEnum.PLAYER2
            }),
            TestFactory.card({
              rank: RankEnum.QUEEN,
              color: ColorEnum.BLACK,
              owner: PlayerEnum.PLAYER2
            }),
            null
          ]
        }
      });

      const store = TestHelpers.setupStore({
        board,
        players,
        firstMoveDone: true
      });

      // Set initial tiebreaker state
      store.dispatch(setTieBreaker(true));
      store.dispatch(setTurn(PlayerEnum.PLAYER2));

      // First round of tied plays (Kings)
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1,
        destination: DestinationEnum.BOARD,
        boardIndex: 14
      }));

      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER2,
        destination: DestinationEnum.BOARD,
        boardIndex: 15
      }));

      // Verify state after first round
      const stateAfterFirstRound = store.getState().game;
      expect(stateAfterFirstRound.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
      expect(stateAfterFirstRound.gameStatus.tieBreaker).toBe(true);

      // Second round of tied plays (Queens)
      store.dispatch(moveCard({
        cardIndex: 1,
        playerId: PlayerEnum.PLAYER1,
        destination: DestinationEnum.BOARD,
        boardIndex: 16
      }));

      store.dispatch(moveCard({
        cardIndex: 1,
        playerId: PlayerEnum.PLAYER2,
        destination: DestinationEnum.BOARD,
        boardIndex: 17
      }));

      // Verify state after second round
      const stateAfterSecondRound = store.getState().game;
      expect(stateAfterSecondRound.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
      expect(stateAfterSecondRound.gameStatus.tieBreaker).toBe(true);

      // Verify that Player 1 still cannot make moves
      store.dispatch(startCardDrag({
        cardIndex: 2,
        playerId: PlayerEnum.PLAYER1
      }));

      const finalState = store.getState().game;
      expect(finalState.highlightedCells).toEqual([]);
      expect(finalState.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
      expect(finalState.gameStatus.tieBreaker).toBe(true);
    });

    it('should properly exit tiebreaker state when cards of different ranks are played', () => {
      // Setup initial board
      const board = TestFactory.board({
        12: [TestFactory.card({
          rank: RankEnum.SIX,
          color: ColorEnum.RED,
          owner: PlayerEnum.PLAYER1
        })],
        13: [TestFactory.card({
          rank: RankEnum.SIX,
          color: ColorEnum.BLACK,
          owner: PlayerEnum.PLAYER2
        })]
      });

      // Setup players with different ranked cards
      const players = TestFactory.players({
        [PlayerEnum.PLAYER1]: {
          hand: [
            TestFactory.card({
              rank: RankEnum.KING,
              color: ColorEnum.RED,
              owner: PlayerEnum.PLAYER1
            }),
            null,
            null
          ]
        },
        [PlayerEnum.PLAYER2]: {
          hand: [
            TestFactory.card({
              rank: RankEnum.QUEEN,
              color: ColorEnum.BLACK,
              owner: PlayerEnum.PLAYER2
            }),
            null,
            null
          ]
        }
      });

      const store = TestHelpers.setupStore({
        board,
        players,
        firstMoveDone: true
      });

      // Set initial tiebreaker state
      store.dispatch(setTieBreaker(true));
      store.dispatch(setTurn(PlayerEnum.PLAYER2));

      // Player 1 plays King
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1,
        destination: DestinationEnum.BOARD,
        boardIndex: 14
      }));

      // Verify turn passed to Player 2
      const stateAfterPlayer1 = store.getState().game;
      expect(stateAfterPlayer1.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
      expect(stateAfterPlayer1.gameStatus.tieBreaker).toBe(true);

      // Player 2 plays Queen
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER2,
        destination: DestinationEnum.BOARD,
        boardIndex: 15
      }));

      // Verify tiebreaker is resolved
      const finalState = store.getState().game;
      expect(finalState.gameStatus.tieBreaker).toBe(false);
      expect(finalState.turn.currentTurn).toBe(PlayerEnum.PLAYER1); // Turn goes to Player 1 since they played higher card
    });
  });
}); 