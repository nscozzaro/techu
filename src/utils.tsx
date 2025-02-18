// src/utils.tsx
import {
  ColorEnum,
  Player,
  PlayerEnum,
  BoardState,
  Move,
  BOARD_SIZE,
  STARTING_INDICES,
  Players,
  PlayerBooleans,
  Scores,
  DiscardPiles,
  InitialFaceDownCards,
  initialFirstMove,
} from './types';
import { shuffle, createDeck } from './logic/deck';
import { calculateValidMoves, getValidMoves, getCardRank } from './logic/moveCalculations';

/* ---------- Basic Utilities ---------- */

/**
 * Initialize a player with a shuffled deck and first 3 cards in hand.
 */
export const initializePlayer = (color: ColorEnum, id: PlayerEnum): Player => {
  const deck = createDeck(color, id);
  shuffle(deck);
  return {
    id,
    hand: deck.slice(0, 3),
    deck: deck.slice(3),
  };
};

/**
 * Initial players state for a new game.
 */
export const initialPlayers = (): Players => ({
  [PlayerEnum.PLAYER1]: initializePlayer(ColorEnum.RED, PlayerEnum.PLAYER1),
  [PlayerEnum.PLAYER2]: initializePlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2),
});

/**
 * Initial board state (5x5 of empty stacks).
 */
export const initialBoardState = (): BoardState =>
  Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => []);

/**
 * Initial scores for both players.
 */
export const initialScores = (): Scores => ({
  [PlayerEnum.PLAYER1]: 0,
  [PlayerEnum.PLAYER2]: 0,
});

/**
 * Initial discard piles for both players.
 */
export const initialDiscardPiles = (): DiscardPiles => ({
  [PlayerEnum.PLAYER1]: [],
  [PlayerEnum.PLAYER2]: [],
});

/**
 * Draw a card for a player, placing it in the first empty slot in their hand.
 */
export const drawCardForPlayer = (player: Player): void => {
  if (player.deck.length > 0) {
    const newCard = player.deck.pop()!;
    const firstEmpty = player.hand.findIndex((c) => c === undefined);
    if (firstEmpty !== -1) {
      player.hand[firstEmpty] = newCard;
    }
  }
};

/**
 * Remove a card from a player's hand, then draw one.
 */
export const updatePlayerHandAndDrawCard = (
  players: Players,
  playerId: PlayerEnum,
  cardIndex: number,
  insertSlot?: number
): Players => {
  const player = players[playerId];
  const newHand = [...player.hand];
  const newDeck = [...player.deck];
  if (cardIndex >= 0 && cardIndex < newHand.length) {
    newHand[cardIndex] = undefined;
    if (newDeck.length > 0) {
      const newCard = newDeck.pop()!;
      if (insertSlot !== undefined && insertSlot >= 0 && insertSlot < newHand.length) {
        newHand[insertSlot] = newCard;
      } else {
        const firstEmpty = newHand.findIndex((c) => c === undefined);
        if (firstEmpty !== -1) {
          newHand[firstEmpty] = newCard;
        }
      }
    }
  }
  return {
    ...players,
    [playerId]: { ...player, hand: newHand, deck: newDeck },
  };
};

/* ---------- Board & Score Utilities ---------- */

/**
 * Apply a "board" move (placing a card from hand onto the board).
 */
export const applyMoveToBoardState = (
  boardState: BoardState,
  players: Players,
  move: Move,
  playerId: PlayerEnum
): { newBoardState: BoardState; updatedPlayers: Players } => {
  if (move.type !== 'board' || move.cellIndex === undefined) {
    return { newBoardState: boardState, updatedPlayers: players };
  }
  const card = players[playerId].hand[move.cardIndex];
  if (!card) return { newBoardState: boardState, updatedPlayers: players };
  const newBoardState = [...boardState];
  newBoardState[move.cellIndex] = [...boardState[move.cellIndex], card];
  const updatedPlayers = updatePlayerHandAndDrawCard(
    players,
    playerId,
    move.cardIndex,
    move.cardIndex
  );
  return { newBoardState, updatedPlayers };
};

/**
 * Get the next player's turn.
 */
export const getNextPlayerTurn = (currentPlayer: PlayerEnum): PlayerEnum =>
  currentPlayer === PlayerEnum.PLAYER1 ? PlayerEnum.PLAYER2 : PlayerEnum.PLAYER1;

/**
 * Calculate scores from the board state.
 */
export const calculateScores = (boardState: BoardState): Scores => {
  const scores = { [PlayerEnum.PLAYER1]: 0, [PlayerEnum.PLAYER2]: 0 };
  boardState.forEach((cellStack) => {
    if (cellStack.length > 0) {
      const topCard = cellStack[cellStack.length - 1];
      if (topCard?.color === ColorEnum.RED) scores[PlayerEnum.PLAYER1]++;
      else if (topCard?.color === ColorEnum.BLACK) scores[PlayerEnum.PLAYER2]++;
    }
  });
  return scores;
};

/**
 * Check if the game is over.
 */
export const isGameOver = (players: Players): boolean =>
  Object.values(players).every(
    (player) =>
      player.hand.every((card) => card === undefined) && player.deck.length === 0
  );

/* ---------- Move Execution Functions ---------- */

/**
 * Perform the player's first move.
 */
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
  const cardIndex = 0;
  const card = players[playerId].hand[cardIndex];
  if (!card) {
    return {
      updatedPlayers: players,
      newBoardState: boardState,
      newFirstMove: initialFirstMove(),
      nextPlayerTurn: getNextPlayerTurn(playerId),
    };
  }
  if (tieBreaker) {
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
    if (validMoves.length > 0) {
      const move = validMoves[Math.floor(Math.random() * validMoves.length)];
      newBoard[move.cellIndex!] = [
        ...newBoard[move.cellIndex!],
        { ...card, faceDown: false },
      ];
      setInitialFaceDownCards({
        [playerId]: { ...card, faceDown: false, cellIndex: move.cellIndex! },
      });
    }
    const newFirstMove = { ...initialFirstMove(), [playerId]: true };
    return {
      updatedPlayers: players,
      newBoardState: newBoard,
      newFirstMove,
      nextPlayerTurn: getNextPlayerTurn(playerId),
    };
  }
  const faceDownCard = { ...card, faceDown: true };
  const updatedPlayers = updatePlayerHandAndDrawCard(players, playerId, cardIndex, cardIndex);
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
  if (validMoves.length > 0) {
    const move = validMoves[Math.floor(Math.random() * validMoves.length)];
    if (move.type === 'board' && move.cellIndex !== undefined) {
      setInitialFaceDownCards({
        [playerId]: { ...faceDownCard, cellIndex: move.cellIndex },
      });
      newBoard[move.cellIndex] = [...newBoard[move.cellIndex], faceDownCard];
    } else {
      console.error('Invalid move type or missing cellIndex in first move.');
    }
  }
  const newFirstMove = { ...initialFirstMove(), [playerId]: false };
  return { updatedPlayers, newBoardState: newBoard, newFirstMove, nextPlayerTurn: getNextPlayerTurn(playerId) };
};

/**
 * Perform a regular (non-first) move.
 */
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
  let selectedMove: Move | undefined;
  if (validMoves.length > 0) {
    selectedMove = validMoves[Math.floor(Math.random() * validMoves.length)];
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

/**
 * Called when dragging a card. Returns valid board indices.
 */
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

/**
 * Place a card on the board.
 */
export const placeCardOnBoardLogic = (
  index: number,
  cardIndex: number,
  playerId: PlayerEnum,
  players: Players,
  boardState: BoardState,
  firstMove: { [key in PlayerEnum]: boolean },
  tieBreaker: boolean,
  setInitialFaceDownCards: (cards: InitialFaceDownCards) => void
): {
  updatedPlayers: Players;
  newBoardState: BoardState;
  newFirstMove: { [key in PlayerEnum]: boolean };
  nextPlayerTurn: PlayerEnum;
} => {
  const card = players[playerId].hand[cardIndex];
  if (!card) {
    return {
      updatedPlayers: players,
      newBoardState: boardState,
      newFirstMove: firstMove,
      nextPlayerTurn: getNextPlayerTurn(playerId),
    };
  }
  const updatedPlayers = updatePlayerHandAndDrawCard(players, playerId, cardIndex, cardIndex);
  let newBoard = boardState.map((cell) => [...cell]);
  if (firstMove[playerId] && !tieBreaker) {
    const faceDownCard = { ...card, faceDown: true };
    setInitialFaceDownCards({ [playerId]: { ...faceDownCard, cellIndex: index } });
    newBoard[index].push(faceDownCard);
  } else if (tieBreaker) {
    const faceUpCard = { ...card, faceDown: false };
    setInitialFaceDownCards({ [playerId]: { ...faceUpCard, cellIndex: index } });
    newBoard[index].push(faceUpCard);
  } else {
    newBoard[index].push(card);
  }
  const newFirstMove = { ...firstMove, [playerId]: false };
  return {
    updatedPlayers,
    newBoardState: newBoard,
    newFirstMove,
    nextPlayerTurn: getNextPlayerTurn(playerId),
  };
};

/**
 * Flip both players' initial face-down cards.
 */
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
  const newBoardState: BoardState = JSON.parse(JSON.stringify(boardState));
  let nextPlayerTurn: PlayerEnum = PlayerEnum.PLAYER1;
  let tieBreaker = false;
  let firstMove = { [PlayerEnum.PLAYER1]: false, [PlayerEnum.PLAYER2]: false };
  Object.values(PlayerEnum).forEach((p) => {
    const cardData = initialFaceDownCards[p];
    if (cardData) {
      const cellIndex = cardData.cellIndex;
      if (newBoardState[cellIndex] && newBoardState[cellIndex].length > 0) {
        const flippedCard = { ...cardData, faceDown: false };
        newBoardState[cellIndex][newBoardState[cellIndex].length - 1] = flippedCard;
      }
    }
  });
  const card1 = initialFaceDownCards[PlayerEnum.PLAYER1];
  const card2 = initialFaceDownCards[PlayerEnum.PLAYER2];
  const rank1 = card1 ? getCardRank(card1.rank) : -1;
  const rank2 = card2 ? getCardRank(card2.rank) : -1;
  if (rank1 === rank2) {
    tieBreaker = true;
    firstMove = initialFirstMove();
  } else {
    tieBreaker = false;
    nextPlayerTurn = rank1 < rank2 ? PlayerEnum.PLAYER1 : PlayerEnum.PLAYER2;
    firstMove = { [PlayerEnum.PLAYER1]: false, [PlayerEnum.PLAYER2]: false };
  }
  return { newBoardState, nextPlayerTurn, tieBreaker, firstMove };
};
