// src/utils.tsx

import {
  Card,
  ColorEnum,
  Cards,
  Player,
  PlayerEnum,
  RankEnum,
  SuitEnum,
  BoardState,
  rankOrder,
  StartingIndices,
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

/* ---------- Basic Utilities ---------- */

/**
 * Shuffle a deck of cards in-place.
 */
export const shuffle = (deck: Cards): void => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
};

/**
 * Create a deck based on color (red/black) and owner.
 */
const createDeck = (color: ColorEnum, owner: PlayerEnum): Cards => {
  const suits =
    color === ColorEnum.RED
      ? [SuitEnum.HEARTS, SuitEnum.DIAMONDS]
      : [SuitEnum.CLUBS, SuitEnum.SPADES];
  const ranks = Object.values(RankEnum);
  return suits.flatMap((suit) =>
    ranks.map((rank) => ({ suit, rank, color, owner }))
  ) as Cards;
};

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
 * Using Array.from ensures that each cell is its own array.
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
      if (
        insertSlot !== undefined &&
        insertSlot >= 0 &&
        insertSlot < newHand.length
      ) {
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
 * Get the next player's turn (simple toggle).
 */
export const getNextPlayerTurn = (currentPlayer: PlayerEnum): PlayerEnum => {
  return currentPlayer === PlayerEnum.PLAYER1
    ? PlayerEnum.PLAYER2
    : PlayerEnum.PLAYER1;
};

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
export const isGameOver = (players: Players): boolean => {
  return Object.values(players).every(
    (player) =>
      player.hand.every((card) => card === undefined) && player.deck.length === 0
  );
};

/* ---------- Valid Move Calculations ---------- */

/**
 * Compute valid moves (board + discard) for a given player.
 */
export const getValidMoves = (
  player: Player,
  playerId: PlayerEnum,
  boardState: BoardState,
  boardSize: number,
  isFirst: boolean,
  startingIndices: StartingIndices,
  tieBreaker: boolean
): Move[] => {
  const boardMoves: Move[] = player.hand.flatMap((card, cardIndex) =>
    card
      ? calculateValidMoves(
          cardIndex,
          playerId,
          boardState,
          boardSize,
          isFirst,
          player.hand,
          startingIndices,
          tieBreaker
        ).map((cellIndex) => ({ type: 'board', cellIndex, cardIndex }))
      : []
  );
  if (!isFirst) {
    const discardMoves: Move[] = player.hand
      .map((card, cardIndex) => (card ? { type: 'discard', cardIndex } : null))
      .filter((move): move is Move => move !== null);
    return [...boardMoves, ...discardMoves];
  }
  return boardMoves;
};

/**
 * Calculate valid board indices for a single card.
 * If tieBreaker is true, the entire home row is considered.
 */
export const calculateValidMoves = (
  cardIndex: number,
  playerType: PlayerEnum,
  boardState: BoardState,
  boardSize: number,
  isFirstMove: boolean,
  hand: Cards,
  startingIndices: StartingIndices,
  isTieBreaker?: boolean
): number[] => {
  const selectedCard = hand[cardIndex];
  if (!selectedCard) return [];
  if (isTieBreaker) {
    const homeRowIndices = getHomeRowIndices(playerType, boardSize);
    return getValidMoveIndices(homeRowIndices, boardState, selectedCard);
  }
  if (isFirstMove) {
    return [startingIndices[playerType]];
  }
  const homeRowIndices = getHomeRowIndices(playerType, boardSize);
  const homeRowValidIndices = getValidMoveIndices(homeRowIndices, boardState, selectedCard);
  const connectedCells = findConnectedCellsToHomeRow(
    playerType,
    boardState,
    selectedCard.color,
    boardSize
  );
  const connectedValidIndices = connectedCells.flatMap((index) => {
    const adjacentIndices = getAdjacentIndices(index, boardSize);
    return getValidMoveIndices(adjacentIndices, boardState, selectedCard);
  });
  return Array.from(new Set([...homeRowValidIndices, ...connectedValidIndices]));
};

/**
 * Return the indices of the player's home row.
 */
export const getHomeRowIndices = (
  playerType: PlayerEnum,
  boardSize: number
): number[] => {
  const row = playerType === PlayerEnum.PLAYER1 ? boardSize - 1 : 0;
  return Array.from({ length: boardSize }, (_, i) => row * boardSize + i);
};

/**
 * Filter out cells where the top card's rank is greater than or equal to the selected card's rank.
 */
export const getValidMoveIndices = (
  indices: number[],
  boardState: BoardState,
  selectedCard: Card
): number[] => {
  return indices.filter((index) => {
    const topCard = boardState[index][boardState[index].length - 1];
    return !topCard || getCardRank(selectedCard.rank) > getCardRank(topCard.rank);
  });
};

/**
 * Convert a RankEnum to its numeric value.
 */
export const getCardRank = (rank: RankEnum): number => {
  return rankOrder[rank];
};

/**
 * Explore adjacent cells with the same color.
 */
const exploreConnectedCells = (
  initialCells: number[],
  boardState: BoardState,
  boardSize: number,
  color: ColorEnum
): Set<number> => {
  const visited = new Set<number>(initialCells);
  const queue = [...initialCells];
  while (queue.length) {
    const currentIndex = queue.shift()!;
    for (const adjIndex of getAdjacentIndices(currentIndex, boardSize)) {
      if (!visited.has(adjIndex)) {
        const topCard = boardState[adjIndex][boardState[adjIndex].length - 1];
        if (topCard && topCard.color === color) {
          visited.add(adjIndex);
          queue.push(adjIndex);
        }
      }
    }
  }
  return visited;
};

/**
 * For non-first moves, find cells connected to the player's home row.
 */
export const findConnectedCellsToHomeRow = (
  playerType: PlayerEnum,
  boardState: BoardState,
  color: ColorEnum,
  boardSize: number
): number[] => {
  const homeRowIndices = getHomeRowIndices(playerType, boardSize).filter((i) => {
    const topCard = boardState[i][boardState[i].length - 1];
    return topCard && topCard.color === color;
  });
  return Array.from(exploreConnectedCells(homeRowIndices, boardState, boardSize, color));
};

/**
 * Pick a random move from a list.
 */
const selectRandomMove = (validMoves: Move[]): Move => {
  return validMoves[Math.floor(Math.random() * validMoves.length)];
};

/**
 * If tieBreaker is true, gather the entire home row as potential moves.
 */
const getValidFirstMoves = (
  playerId: PlayerEnum,
  card: Card,
  cardIndex: number,
  boardState: BoardState,
  tieBreaker: boolean
): Move[] => {
  if (tieBreaker) {
    const homeRowIndices = getHomeRowIndices(playerId, BOARD_SIZE);
    return homeRowIndices.map((cellIndex) => ({
      type: 'board',
      cellIndex,
      cardIndex,
    }));
  }
  return [{ type: 'board', cellIndex: STARTING_INDICES[playerId], cardIndex }];
};

/* ---------- Move Execution Functions ---------- */

/**
 * Perform the player's first move.
 * • Normal first move: place card face-down.
 * • Tie-breaker: record the played card as face-up and return the next turn as the opponent.
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
    // In a tie-breaker, record the card as face-up.
    const validMoves = getValidFirstMoves(playerId, card, cardIndex, boardState, true);
    let newBoard = [...boardState];
    if (validMoves.length > 0) {
      const move = selectRandomMove(validMoves);
      newBoard[move.cellIndex!] = [
        ...newBoard[move.cellIndex!],
        { ...card, faceDown: false },
      ];
      setInitialFaceDownCards({
        [playerId]: { ...card, faceDown: false, cellIndex: move.cellIndex! },
      });
    }
    // Return next turn as the opponent so that Player 2 gets to play.
    const newFirstMove: PlayerBooleans = { ...initialFirstMove(), [playerId]: true };
    return {
      updatedPlayers: players,
      newBoardState: newBoard,
      newFirstMove,
      nextPlayerTurn: getNextPlayerTurn(playerId),
    };
  }
  // Normal first move: place the card face-down.
  const faceDownCard = { ...card, faceDown: true };
  const updatedPlayers = updatePlayerHandAndDrawCard(players, playerId, cardIndex, cardIndex);
  const validMoves = getValidFirstMoves(playerId, card, cardIndex, boardState, false);
  let newBoard = [...boardState];
  if (validMoves.length > 0) {
    const move = selectRandomMove(validMoves);
    if (move.type === 'board' && move.cellIndex !== undefined) {
      setInitialFaceDownCards({
        [playerId]: { ...faceDownCard, cellIndex: move.cellIndex },
      });
      newBoard[move.cellIndex] = [...newBoard[move.cellIndex], faceDownCard];
    } else {
      console.error('Invalid move type or missing cellIndex in first move.');
    }
  }
  const newFirstMove: PlayerBooleans = { ...initialFirstMove(), [playerId]: false };
  const nextPlayerTurn = getNextPlayerTurn(playerId);
  return { updatedPlayers, newBoardState: newBoard, newFirstMove, nextPlayerTurn };
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
    players[playerId],
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
    selectedMove = selectRandomMove(validMoves);
    if (selectedMove.type === 'board') {
      const result = applyMoveToBoardState(boardState, players, selectedMove, playerId);
      newBoard = result.newBoardState;
      updatedPlayers = result.updatedPlayers;
      moveMade = true;
    } else if (selectedMove.type === 'discard') {
      moveMade = true;
    }
  }
  const nextPlayerTurn = getNextPlayerTurn(playerId);
  return { updatedPlayers, newBoardState: newBoard, nextPlayerTurn, moveMade, move: selectedMove };
};

/**
 * Called when dragging a card. Returns valid board indices.
 */
export const handleCardDragLogic = (
  cardIndex: number,
  playerId: PlayerEnum,
  boardState: BoardState,
  players: Players,
  firstMove: PlayerBooleans,
  tieBreaker: boolean
): number[] => {
  return calculateValidMoves(
    cardIndex,
    playerId,
    boardState,
    BOARD_SIZE,
    firstMove[playerId],
    players[playerId].hand,
    STARTING_INDICES,
    tieBreaker
  );
};

/**
 * Place a card on the board.
 * - If it's a first move and not in a tie-breaker, place face-down.
 * - In a tie-breaker, place the card face-up.
 * - Otherwise, normal placement.
 */
export const placeCardOnBoardLogic = (
  index: number,
  cardIndex: number,
  playerId: PlayerEnum,
  players: Players,
  boardState: BoardState,
  firstMove: PlayerBooleans,
  tieBreaker: boolean,
  setInitialFaceDownCards: (cards: InitialFaceDownCards) => void
): {
  updatedPlayers: Players;
  newBoardState: BoardState;
  newFirstMove: PlayerBooleans;
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
  const newFirstMove: PlayerBooleans = { ...firstMove, [playerId]: false };
  const nextPlayerTurn = getNextPlayerTurn(playerId);
  return { updatedPlayers, newBoardState: newBoard, newFirstMove, nextPlayerTurn };
};

/**
 * Flip both players' initial face-down cards.
 * - If the two tie-breaker cards have equal rank, tieBreaker remains true and both players' firstMove remain unchanged.
 * - Otherwise, tieBreaker is set to false, both players' firstMove become false, and nextPlayerTurn is set to the player with the lower-ranked card.
 * If either tie-breaker card is missing, return the board state unchanged.
 */
export const flipInitialCardsLogic = (
  initialFaceDownCards: InitialFaceDownCards,
  boardState: BoardState
): {
  newBoardState: BoardState;
  nextPlayerTurn: PlayerEnum;
  tieBreaker: boolean;
  firstMove: PlayerBooleans;
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
  let firstMove: PlayerBooleans = { [PlayerEnum.PLAYER1]: false, [PlayerEnum.PLAYER2]: false };
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

/**
 * Return all adjacent cell indices (up, down, left, right).
 */
export const getAdjacentIndices = (index: number, boardSize: number): number[] => {
  const indices: number[] = [];
  const row = Math.floor(index / boardSize);
  const col = index % boardSize;
  if (row > 0) indices.push(index - boardSize);
  if (row < boardSize - 1) indices.push(index + boardSize);
  if (col > 0) indices.push(index - 1);
  if (col < boardSize - 1) indices.push(index + 1);
  return indices;
};
