// src/features/gameLogic.ts
import {
  ColorEnum,
  Player,
  PlayerEnum,
  BoardState,
  Move,
  Players,
  PlayerBooleans,
  Scores,
  DiscardPiles,
  InitialFaceDownCards,
  BOARD_SIZE,
  STARTING_INDICES,
} from '../types';
import { rankOrder, initialFirstMove } from '../types';
import { createDeck, shuffle } from '../logic/deck';
import { getValidMoves, calculateValidMoves } from '../logic/moveCalculations';

/* ---------- Player & Board Initialization ---------- */
export const initializePlayer = (color: ColorEnum, id: PlayerEnum): Player => {
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

/* ---------- Hand & Deck Updates ---------- */
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
  return { ...players, [playerId]: { ...player, hand: newHand, deck: newDeck } };
};

/* ---------- Turn & Game Status ---------- */
export const getNextPlayerTurn = (currentPlayer: PlayerEnum): PlayerEnum =>
  currentPlayer === PlayerEnum.PLAYER1 ? PlayerEnum.PLAYER2 : PlayerEnum.PLAYER1;

export const isGameOver = (players: Players): boolean =>
  Object.values(players).every(
    (player) =>
      player.hand.every((card) => card === undefined) && player.deck.length === 0
  );

/* ---------- Move Execution Functions ---------- */
const applyMoveToBoardState = (
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

/* ---------- First Move Helpers ---------- */
const handleFirstMoveTieBreaker = (
  players: Players,
  playerId: PlayerEnum,
  boardState: BoardState,
  card: NonNullable<Player['hand'][0]>,
  setInitialFaceDownCards: (cards: InitialFaceDownCards) => void
): { newBoardState: BoardState } => {
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
  return { newBoardState: newBoard };
};

const handleFirstMoveNormal = (
  players: Players,
  playerId: PlayerEnum,
  boardState: BoardState,
  card: NonNullable<Player['hand'][0]>,
  setInitialFaceDownCards: (cards: InitialFaceDownCards) => void
): { updatedPlayers: Players; newBoardState: BoardState } => {
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
  if (validMoves.length > 0) {
    const move = validMoves[Math.floor(Math.random() * validMoves.length)];
    if (move.type === 'board' && move.cellIndex !== undefined) {
      setInitialFaceDownCards({
        [playerId]: { ...faceDownCard, cellIndex: move.cellIndex },
      });
      newBoard[move.cellIndex] = [...newBoard[move.cellIndex], faceDownCard];
    }
  }
  return { updatedPlayers, newBoardState: newBoard };
};

/* ---------- Public Move Execution Functions ---------- */
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
    const { newBoardState } = handleFirstMoveTieBreaker(
      players,
      playerId,
      boardState,
      card,
      setInitialFaceDownCards
    );
    return {
      updatedPlayers: players,
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

/* ---------- Refactored Flip Initial Cards Logic Helpers ---------- */
const flipCardsInBoard = (
  initialFaceDownCards: InitialFaceDownCards,
  boardState: BoardState
): BoardState => {
  const newBoardState: BoardState = JSON.parse(JSON.stringify(boardState));
  Object.values(PlayerEnum).forEach((p) => {
    const cardData = initialFaceDownCards[p];
    if (cardData) {
      const cellIndex = cardData.cellIndex;
      if (newBoardState[cellIndex]?.length) {
        newBoardState[cellIndex][newBoardState[cellIndex].length - 1] = {
          ...cardData,
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
      nextPlayerTurn: getNextPlayerTurn(PlayerEnum.PLAYER1),
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

/* ---------- Public Flip Initial Cards Logic ---------- */
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

/* ---------- New: Calculate Scores ---------- */
export const calculateScores = (boardState: BoardState): Scores => {
  const scores: Scores = { [PlayerEnum.PLAYER1]: 0, [PlayerEnum.PLAYER2]: 0 };
  boardState.forEach((cellStack) => {
    if (cellStack.length > 0) {
      const topCard = cellStack[cellStack.length - 1];
      if (topCard?.color === ColorEnum.RED) scores[PlayerEnum.PLAYER1]++;
      else if (topCard?.color === ColorEnum.BLACK) scores[PlayerEnum.PLAYER2]++;
    }
  });
  return scores;
};
