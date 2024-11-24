// utils.tsx
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

// Function to shuffle a deck
export const shuffle = (deck: Cards): void => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
};

// Function to create a deck based on color and owner
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

// Function to initialize a player
export const initializePlayer = (
  color: ColorEnum,
  id: PlayerEnum
): Player => {
  const deck = createDeck(color, id);
  shuffle(deck);
  return {
    id,
    hand: deck.slice(0, 3),
    deck: deck.slice(3),
  };
};

// Initialize players
export const initialPlayers = (): Players => ({
  [PlayerEnum.PLAYER1]: initializePlayer(ColorEnum.RED, PlayerEnum.PLAYER1),
  [PlayerEnum.PLAYER2]: initializePlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2),
});

// Initialize board state
export const initialBoardState = (): BoardState =>
  Array(BOARD_SIZE * BOARD_SIZE).fill([]) as BoardState;

// Initialize scores
export const initialScores = (): Scores => ({
  [PlayerEnum.PLAYER1]: 0,
  [PlayerEnum.PLAYER2]: 0,
});

// Initialize discard piles
export const initialDiscardPiles = (): DiscardPiles => ({
  [PlayerEnum.PLAYER1]: [],
  [PlayerEnum.PLAYER2]: [],
});

// Function to draw a card for a player and place it in the first empty slot
export const drawCardForPlayer = (player: Player): void => {
  if (player.deck.length > 0) {
    const newCard = player.deck.pop()!;
    const firstEmpty = player.hand.findIndex(card => card === undefined);
    if (firstEmpty !== -1) {
      player.hand[firstEmpty] = newCard;
    }
  }
};

// Function to update player's hand by removing a card and drawing a new one
export const updatePlayerHandAndDrawCard = (
  players: Players,
  playerId: PlayerEnum,
  cardIndex: number,
  insertSlot?: number
): Players => {
  const updatedPlayer = { ...players[playerId] };
  if (cardIndex >= 0 && cardIndex < updatedPlayer.hand.length) {
    updatedPlayer.hand[cardIndex] = undefined;
    if (updatedPlayer.deck.length > 0) {
      const newCard = updatedPlayer.deck.pop()!;
      if (
        insertSlot !== undefined &&
        insertSlot >= 0 &&
        insertSlot < updatedPlayer.hand.length
      ) {
        updatedPlayer.hand[insertSlot] = newCard;
      } else {
        const firstEmpty = updatedPlayer.hand.findIndex(card => card === undefined);
        if (firstEmpty !== -1) {
          updatedPlayer.hand[firstEmpty] = newCard;
        }
      }
    }
  }
  return { ...players, [playerId]: updatedPlayer };
};

// Function to apply a board move to the board state
export const applyMoveToBoardState = (
  boardState: BoardState,
  players: Players,
  move: Move,
  playerId: PlayerEnum
): {
  newBoardState: BoardState;
  updatedPlayers: Players;
} => {
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

// Function to get the next player's turn
export const getNextPlayerTurn = (currentPlayer: PlayerEnum): PlayerEnum => {
  return currentPlayer === PlayerEnum.PLAYER1
    ? PlayerEnum.PLAYER2
    : PlayerEnum.PLAYER1;
};

// Function to calculate scores based on board state
export const calculateScores = (
  boardState: BoardState
): Scores => {
  const scores = { [PlayerEnum.PLAYER1]: 0, [PlayerEnum.PLAYER2]: 0 };
  boardState.forEach((cellStack) => {
    if (cellStack.length > 0) {
      const topCard = cellStack[cellStack.length - 1];
      if (topCard && topCard.color === ColorEnum.RED) scores[PlayerEnum.PLAYER1]++;
      else if (topCard && topCard.color === ColorEnum.BLACK) scores[PlayerEnum.PLAYER2]++;
    }
  });
  return scores;
};

// Function to check if the game is over
export const isGameOver = (players: Players): boolean => {
  return Object.values(players).every(
    (player) => player.hand.every(card => card === undefined) && player.deck.length === 0
  );
};

// Function to get valid moves for a player, including discards
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

// Function to calculate valid move indices for a card
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

  if (isFirstMove) {
    if (isTieBreaker) {
      const homeRowIndices = getHomeRowIndices(playerType, boardSize);
      return getValidMoveIndices(homeRowIndices, boardState, selectedCard);
    }
    return [startingIndices[playerType]];
  }

  const homeRowIndices = getHomeRowIndices(playerType, boardSize);
  const homeRowValidIndices = getValidMoveIndices(
    homeRowIndices,
    boardState,
    selectedCard
  );

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

// Function to get home row indices for a player
export const getHomeRowIndices = (
  playerType: PlayerEnum,
  boardSize: number
): number[] => {
  const row = playerType === PlayerEnum.PLAYER1 ? boardSize - 1 : 0;
  return Array.from({ length: boardSize }, (_, i) => row * boardSize + i);
};

// Function to get valid move indices from a list of indices
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

// Function to get the rank of a card
export const getCardRank = (rank: RankEnum): number => {
  return rankOrder[rank];
};

// Function to explore connected cells
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

// Function to find connected cells to home row
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
  return Array.from(
    exploreConnectedCells(homeRowIndices, boardState, boardSize, color)
  );
};

// Function to perform first move for a player
export const performFirstMoveForPlayer = (
  players: Players,
  playerId: PlayerEnum,
  boardState: BoardState,
  tieBreaker: boolean,
  setInitialFaceDownCards: React.Dispatch<React.SetStateAction<InitialFaceDownCards>>
): {
  updatedPlayers: Players;
  newBoardState: BoardState;
  newFirstMove: PlayerBooleans;
  nextPlayerTurn: PlayerEnum;
} => {
  const cardIndex = 0;
  const card = players[playerId].hand[cardIndex];
  if (!card) return { updatedPlayers: players, newBoardState: boardState, newFirstMove: initialFirstMove(), nextPlayerTurn: getNextPlayerTurn(playerId) };

  const faceDownCard = { ...card, faceDown: true };

  const updatedPlayers = updatePlayerHandAndDrawCard(
    players,
    playerId,
    cardIndex,
    cardIndex
  );

  const validMoves = getValidFirstMoves(
    playerId,
    card,
    cardIndex,
    boardState,
    tieBreaker
  );

  let newBoardState = [...boardState];

  if (validMoves.length > 0) {
    const move = selectRandomMove(validMoves);
    if (move.type === 'board' && move.cellIndex !== undefined) {
      setInitialFaceDownCards((prev: InitialFaceDownCards) => ({
        ...prev,
        [playerId]: { ...faceDownCard, cellIndex: move.cellIndex },
      }));
      newBoardState[move.cellIndex] = [
        ...newBoardState[move.cellIndex],
        faceDownCard,
      ];
    } else {
      console.error('Invalid move type or missing cellIndex during first move.');
    }
  }

  const newFirstMove: PlayerBooleans = {
    ...initialFirstMove(),
    [playerId]: false,
  };
  const nextPlayerTurn = getNextPlayerTurn(playerId);

  return { updatedPlayers, newBoardState, newFirstMove, nextPlayerTurn };
};

// Helper function to get valid first moves
const getValidFirstMoves = (
  playerId: PlayerEnum,
  card: Card,
  cardIndex: number,
  boardState: BoardState,
  tieBreaker: boolean
): Move[] => {
  if (tieBreaker) {
    const homeRowIndices = getHomeRowIndices(playerId, BOARD_SIZE);
    const validIndices = getValidMoveIndices(homeRowIndices, boardState, card);
    return validIndices.map((cellIndex) => ({ type: 'board', cellIndex, cardIndex }));
  }
  return [{ type: 'board', cellIndex: STARTING_INDICES[playerId], cardIndex }];
};

// Helper function to select a random move from valid moves
const selectRandomMove = (validMoves: Move[]): Move => {
  return validMoves[Math.floor(Math.random() * validMoves.length)];
};

// Function to perform regular move for a player
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

  let newBoardState = [...boardState];
  let updatedPlayers = { ...players };
  let moveMade = false;
  let selectedMove: Move | undefined;

  if (validMoves.length > 0) {
    selectedMove = selectRandomMove(validMoves);
    if (selectedMove.type === 'board') {
      const result = applyMoveToBoardState(boardState, players, selectedMove, playerId);
      newBoardState = result.newBoardState;
      updatedPlayers = result.updatedPlayers;
      moveMade = true;
    } else if (selectedMove.type === 'discard') {
      moveMade = true;
    }
  }

  const nextPlayerTurn = getNextPlayerTurn(playerId);

  return { updatedPlayers, newBoardState, nextPlayerTurn, moveMade, move: selectedMove };
};

// Function to handle card drag logic
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

// Function to handle placing card on board
export const placeCardOnBoardLogic = (
  index: number,
  cardIndex: number,
  players: Players,
  boardState: BoardState,
  firstMove: PlayerBooleans,
  setInitialFaceDownCards: React.Dispatch<React.SetStateAction<InitialFaceDownCards>>
): {
  updatedPlayers: Players;
  newBoardState: BoardState;
  newFirstMove: PlayerBooleans;
  nextPlayerTurn: PlayerEnum;
} => {
  const playerId = PlayerEnum.PLAYER1;
  const card = players[playerId].hand[cardIndex];
  if (!card) return { updatedPlayers: players, newBoardState: boardState, newFirstMove: firstMove, nextPlayerTurn: getNextPlayerTurn(playerId) };

  const faceDownCard = { ...card, faceDown: true };

  const updatedPlayers = updatePlayerHandAndDrawCard(
    players,
    playerId,
    cardIndex,
    cardIndex
  );

  let newBoardState = [...boardState];

  if (firstMove[playerId]) {
    setInitialFaceDownCards((prev: InitialFaceDownCards) => ({
      ...prev,
      [playerId]: { ...faceDownCard, cellIndex: index },
    }));
    newBoardState[index] = [...newBoardState[index], faceDownCard];
  } else {
    newBoardState[index] = [...newBoardState[index], card];
  }

  const newFirstMove: PlayerBooleans = {
    ...firstMove,
    [playerId]: false,
  };
  const nextPlayerTurn = getNextPlayerTurn(playerId);

  return { updatedPlayers, newBoardState, newFirstMove, nextPlayerTurn };
};

// Function to flip initial cards
export const flipInitialCardsLogic = (
  initialFaceDownCards: InitialFaceDownCards,
  boardState: BoardState
): {
  newBoardState: BoardState;
  nextPlayerTurn: PlayerEnum;
  tieBreaker: boolean;
  firstMove: PlayerBooleans;
} => {
  let newBoardState = [...boardState];
  let nextPlayerTurn = PlayerEnum.PLAYER1;
  let tieBreaker = false;
  let firstMove: PlayerBooleans = {
    [PlayerEnum.PLAYER1]: false,
    [PlayerEnum.PLAYER2]: false,
  };

  Object.values(PlayerEnum).forEach((playerId) => {
    const cardData = initialFaceDownCards[playerId];
    if (cardData) {
      const flippedCard = { ...cardData, faceDown: false };
      newBoardState[cardData.cellIndex][
        newBoardState[cardData.cellIndex].length - 1
      ] = flippedCard;
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
    nextPlayerTurn =
      rank1 < rank2 ? PlayerEnum.PLAYER1 : PlayerEnum.PLAYER2;
  }

  return { newBoardState, nextPlayerTurn, tieBreaker, firstMove };
};

// Helper function to get adjacent indices
export const getAdjacentIndices = (
  index: number,
  boardSize: number
): number[] => {
  const indices: number[] = [];
  const row = Math.floor(index / boardSize);
  const col = index % boardSize;

  if (row > 0) indices.push(index - boardSize); // Above
  if (row < boardSize - 1) indices.push(index + boardSize); // Below
  if (col > 0) indices.push(index - 1); // Left
  if (col < boardSize - 1) indices.push(index + 1); // Right

  return indices;
};
