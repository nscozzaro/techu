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
  CellIndex
} from '../types';

type RootState = {
  game: GameState;
};

describe('Game Integration Tests', () => {
  let store: ReturnType<typeof configureStore<{
    game: ReturnType<typeof gameReducer>;
  }>>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        game: gameReducer
      }
    }) as typeof store;
  });

  describe('Game Initialization', () => {
    it('should initialize game with correct state', () => {
      const state = store.getState().game;
      
      // Check initial board state
      expect(state.board).toHaveLength(BOARD_SIZE * BOARD_SIZE);
      expect(state.board.every((cell: Cards) => Array.isArray(cell) && cell.length === 0)).toBe(true);
      
      // Check players initialization
      expect(state.players[PlayerEnum.PLAYER1].hand).toHaveLength(3);
      expect(state.players[PlayerEnum.PLAYER2].hand).toHaveLength(3);
      expect(state.players[PlayerEnum.PLAYER1].deck.length).toBeGreaterThan(0);
      expect(state.players[PlayerEnum.PLAYER2].deck.length).toBeGreaterThan(0);
      
      // Check initial game status
      expect(state.turn.currentTurn).toBe(PlayerEnum.PLAYER1);
      expect(state.gameStatus.gameOver).toBe(false);
      expect(state.gameStatus.tieBreaker).toBe(false);
      expect(state.gameStatus.firstMove[PlayerEnum.PLAYER1]).toBe(true);
      expect(state.gameStatus.firstMove[PlayerEnum.PLAYER2]).toBe(true);
    });
  });

  describe('First Move Mechanics', () => {
    it('should handle first move correctly', () => {
      const state = store.getState().game;
      const player1FirstCard = state.players[PlayerEnum.PLAYER1].hand[0];
      
      if (!player1FirstCard) {
        throw new Error('Expected player 1 to have a card in hand[0]');
      }
      
      // Make first move for Player 1
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1,
        destination: DestinationEnum.BOARD,
        boardIndex: STARTING_INDICES[PlayerEnum.PLAYER1]
      }));

      const newState = store.getState().game;
      
      // Check card placement
      expect(newState.board[STARTING_INDICES[PlayerEnum.PLAYER1]][0]).toEqual({
        ...player1FirstCard,
        faceDown: true
      });
      
      // Check turn changed
      expect(newState.turn.currentTurn).toBe(PlayerEnum.PLAYER2);
      
      // Check first move status updated
      expect(newState.gameStatus.firstMove[PlayerEnum.PLAYER1]).toBe(false);
      expect(newState.gameStatus.firstMove[PlayerEnum.PLAYER2]).toBe(true);
    });
  });

  describe('Tie Breaker Scenarios', () => {
    it('should handle tie breaker when initial cards have same rank', async () => {
      // Make first moves for both players
      const initialState = store.getState().game;
      
      // Player 1 first move
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER1,
        destination: DestinationEnum.BOARD,
        boardIndex: STARTING_INDICES[PlayerEnum.PLAYER1]
      }));

      // Player 2 first move
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: PlayerEnum.PLAYER2,
        destination: DestinationEnum.BOARD,
        boardIndex: STARTING_INDICES[PlayerEnum.PLAYER2]
      }));

      // Flip initial cards
      store.dispatch(flipInitialCards());
      
      const stateAfterFlip = store.getState().game;
      
      // If it's a tie breaker, cards should be face up
      if (stateAfterFlip.gameStatus.tieBreaker) {
        const player1Card = stateAfterFlip.board[STARTING_INDICES[PlayerEnum.PLAYER1]][0];
        const player2Card = stateAfterFlip.board[STARTING_INDICES[PlayerEnum.PLAYER2]][0];
        
        if (!player1Card || !player2Card) {
          throw new Error('Expected both players to have cards on the board');
        }
        
        expect(player1Card.faceDown).toBe(false);
        expect(player2Card.faceDown).toBe(false);
      }
    });
  });

  describe('Regular Gameplay', () => {
    it('should handle regular moves correctly', () => {
      // Setup game past initial moves
      const state = store.getState().game;
      
      // Make initial moves
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

      // Test regular move
      const stateBeforeMove = store.getState().game;
      const currentPlayer = stateBeforeMove.turn.currentTurn;
      const cardToPlay = stateBeforeMove.players[currentPlayer].hand[0];

      if (!cardToPlay) {
        throw new Error('Expected current player to have a card in hand[0]');
      }

      // Make a regular move
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: currentPlayer,
        destination: DestinationEnum.BOARD,
        boardIndex: STARTING_INDICES[currentPlayer] + BOARD_SIZE // Move to adjacent cell
      }));

      const stateAfterMove = store.getState().game;
      
      // Verify move results
      expect(stateAfterMove.turn.currentTurn).not.toBe(currentPlayer);
      expect(stateAfterMove.players[currentPlayer].hand[0]).not.toEqual(cardToPlay);
    });

    it('should handle discard moves correctly', () => {
      const state = store.getState().game;
      
      // Setup game past initial moves first
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

      // Now test discard
      const stateBeforeDiscard = store.getState().game;
      const currentPlayer = stateBeforeDiscard.turn.currentTurn;
      const cardToDiscard = stateBeforeDiscard.players[currentPlayer].hand[0];

      if (!cardToDiscard) {
        throw new Error('Expected current player to have a card in hand[0]');
      }

      // Make a discard move
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: currentPlayer,
        destination: DestinationEnum.DISCARD
      }));

      const stateAfterDiscard = store.getState().game;
      
      // Verify discard results
      expect(stateAfterDiscard.discard[currentPlayer]).toHaveLength(1);
      expect(stateAfterDiscard.discard[currentPlayer][0]).toEqual({
        ...cardToDiscard,
        faceDown: true
      });
    });
  });

  describe('Game Completion', () => {
    it('should detect game over when all cards are played', () => {
      const state = store.getState().game;
      
      // Simulate playing all cards
      const simulateEmptyHands = (players: Players): Players => ({
        [PlayerEnum.PLAYER1]: {
          ...players[PlayerEnum.PLAYER1],
          hand: [null, null, null],
          deck: []
        },
        [PlayerEnum.PLAYER2]: {
          ...players[PlayerEnum.PLAYER2],
          hand: [null, null, null],
          deck: []
        }
      });

      // Create a state with no cards left
      const emptyState: GameState = {
        ...state,
        players: simulateEmptyHands(state.players)
      };

      expect(isGameOver(emptyState.players)).toBe(true);
    });

    it('should calculate scores correctly', () => {
      // Create a test board with known card positions
      const testBoard: BoardState = Array(BOARD_SIZE * BOARD_SIZE).fill([]).map(() => []);
      
      // Add some cards to the board
      testBoard[0] = [{
        color: ColorEnum.RED,
        suit: SuitEnum.HEARTS,
        rank: RankEnum.ACE,
        owner: PlayerEnum.PLAYER1,
        faceDown: false
      }];
      
      testBoard[1] = [{
        color: ColorEnum.BLACK,
        suit: SuitEnum.SPADES,
        rank: RankEnum.KING,
        owner: PlayerEnum.PLAYER2,
        faceDown: false
      }];

      const scores = calculateScores(testBoard);
      
      expect(scores[PlayerEnum.PLAYER1]).toBe(1); // Red card
      expect(scores[PlayerEnum.PLAYER2]).toBe(1); // Black card
    });
  });

  describe('Cell Highlighting', () => {
    it('should highlight only starting position for first move', () => {
      const state = store.getState().game;
      const player1 = PlayerEnum.PLAYER1;
      const card = state.players[player1].hand[0];

      if (!card) {
        throw new Error('Expected player 1 to have a card in hand[0]');
      }

      store.dispatch(getValidMoves({ playerId: player1, card }));
      const stateAfterHighlight = store.getState().game;

      // For first move, only starting position should be highlighted
      expect(stateAfterHighlight.highlightedCells).toEqual([STARTING_INDICES[player1]]);
    });

    it('should highlight home row cells for tie breaker', () => {
      // Setup tie breaker scenario
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

      // Force tie breaker state
      store.dispatch(setTieBreaker(true));

      const stateBeforeHighlight = store.getState().game;
      const currentPlayer = PlayerEnum.PLAYER1;
      const card = stateBeforeHighlight.players[currentPlayer].hand[0];

      if (!card) {
        throw new Error('Expected player to have a card in hand[0]');
      }

      store.dispatch(getValidMoves({ playerId: currentPlayer, card }));
      const stateAfterHighlight = store.getState().game;

      // In tie breaker, only valid cells in home row should be highlighted
      const homeRowStart = currentPlayer === PlayerEnum.PLAYER1 ? 
        BOARD_SIZE * (BOARD_SIZE - 1) : 0;
      const homeRow = Array.from(
        { length: BOARD_SIZE }, 
        (_, i) => homeRowStart + i
      );

      // Check that all highlighted cells are in the home row
      expect(stateAfterHighlight.highlightedCells.every(cell => 
        homeRow.includes(cell)
      )).toBe(true);
    });

    it('should highlight valid moves for regular play', () => {
      // Setup regular play scenario
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

      const stateBeforeHighlight = store.getState().game;
      const currentPlayer = stateBeforeHighlight.turn.currentTurn;
      const card = stateBeforeHighlight.players[currentPlayer].hand[0];

      if (!card) {
        throw new Error('Expected current player to have a card in hand[0]');
      }

      store.dispatch(getValidMoves({ playerId: currentPlayer, card }));
      const stateAfterHighlight = store.getState().game;

      // In regular play, highlighted cells should include:
      // 1. Valid cells in home row
      // 2. Valid cells adjacent to connected cells of same color
      expect(stateAfterHighlight.highlightedCells.length).toBeGreaterThan(0);
      
      // Verify each highlighted cell is either in home row or adjacent to a connected cell
      const homeRowStart = currentPlayer === PlayerEnum.PLAYER1 ? 
        BOARD_SIZE * (BOARD_SIZE - 1) : 0;
      const homeRow = Array.from(
        { length: BOARD_SIZE }, 
        (_, i) => homeRowStart + i
      );

      stateAfterHighlight.highlightedCells.forEach(cell => {
        const isInHomeRow = homeRow.includes(cell);
        // Check if the cell is adjacent to a connected cell by checking if it's within one row/column
        const row = Math.floor(cell / BOARD_SIZE);
        const col = cell % BOARD_SIZE;
        const isAdjacentToConnected = [-1, 0, 1].some(rowOffset => 
          [-1, 0, 1].some(colOffset => {
            if (rowOffset === 0 && colOffset === 0) return false;
            if (Math.abs(rowOffset) === 1 && Math.abs(colOffset) === 1) return false;
            
            const adjRow = row + rowOffset;
            const adjCol = col + colOffset;
            if (adjRow < 0 || adjRow >= BOARD_SIZE || adjCol < 0 || adjCol >= BOARD_SIZE) return false;
            
            const adjCell = adjRow * BOARD_SIZE + adjCol;
            const adjStack = stateAfterHighlight.board[adjCell];
            const topCard = adjStack[adjStack.length - 1];
            return topCard && topCard.color === card.color;
          })
        );
        expect(isInHomeRow || isAdjacentToConnected).toBe(true);
      });
    });

    it('should clear highlights after move is made', () => {
      const state = store.getState().game;
      const player1 = PlayerEnum.PLAYER1;
      const card = state.players[player1].hand[0];

      if (!card) {
        throw new Error('Expected player 1 to have a card in hand[0]');
      }

      // First get valid moves
      store.dispatch(getValidMoves({ playerId: player1, card }));
      
      // Then make a move
      store.dispatch(moveCard({
        cardIndex: 0,
        playerId: player1,
        destination: DestinationEnum.BOARD,
        boardIndex: STARTING_INDICES[player1]
      }));

      const stateAfterMove = store.getState().game;
      expect(stateAfterMove.highlightedCells).toHaveLength(0);
    });
  });
}); 