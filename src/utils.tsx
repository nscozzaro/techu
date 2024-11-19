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
} from './types';

export const shuffle = (deck: Cards): void => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
};

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

export const getCardRank = (rank: RankEnum): number => {
  return rankOrder[rank];
};

export const createDeck = (
  color: ColorEnum,
  owner: PlayerEnum
): Cards => {
  const suits =
    color === ColorEnum.RED
      ? [SuitEnum.HEARTS, SuitEnum.DIAMONDS]
      : [SuitEnum.CLUBS, SuitEnum.SPADES];
  const ranks = Object.values(RankEnum);
  return suits.flatMap((suit) =>
    ranks.map((rank) => ({ suit, rank, color, owner }))
  );
};

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

export const drawCardForPlayer = (player: Player): void => {
  if (player.hand.length < 3 && player.deck.length > 0) {
    player.hand.push(player.deck.pop()!);
  }
};

export const isSelectedCardGreaterThanTopCard = (
  selectedCard: Card,
  topCard?: Card
): boolean => {
  return (
    !topCard || getCardRank(selectedCard.rank) > getCardRank(topCard.rank)
  );
};

export const getHomeRowIndices = (
  playerType: PlayerEnum,
  boardSize: number
): number[] => {
  const row = playerType === PlayerEnum.PLAYER1 ? boardSize - 1 : 0;
  return Array.from({ length: boardSize }, (_, i) => row * boardSize + i);
};

export const exploreConnectedCells = (
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

export const findConnectedCellsToHomeRow = (
  playerType: PlayerEnum,
  boardState: BoardState,
  color: ColorEnum,
  boardSize: number
): number[] => {
  const homeRowIndices = getHomeRowIndices(playerType, boardSize).filter(
    (i) => {
      const topCard = boardState[i][boardState[i].length - 1];
      return topCard && topCard.color === color;
    }
  );
  return Array.from(
    exploreConnectedCells(homeRowIndices, boardState, boardSize, color)
  );
};

export const getValidMoveIndices = (
  indices: number[],
  boardState: BoardState,
  selectedCard: Card
): number[] => {
  return indices.filter((index) => {
    const topCard = boardState[index][boardState[index].length - 1];
    return isSelectedCardGreaterThanTopCard(selectedCard, topCard);
  });
};

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

  if (isFirstMove) {
    if (isTieBreaker) {
      // During tie-breaker, allow any valid move in the home row
      const homeRowIndices = getHomeRowIndices(playerType, boardSize);
      return getValidMoveIndices(homeRowIndices, boardState, selectedCard);
    }
    // Non-tie-breaker first move: only starting index
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

  return Array.from(
    new Set([...homeRowValidIndices, ...connectedValidIndices])
  );
};

export const updatePlayerHandAndDrawCard = (
  player: Player,
  cardIndex: number
): Player => {
  const updatedPlayer = { ...player };
  updatedPlayer.hand = [...updatedPlayer.hand];
  updatedPlayer.hand.splice(cardIndex, 1);
  drawCardForPlayer(updatedPlayer);
  return updatedPlayer;
};

export const applyMoveToBoardState = (
  boardState: BoardState,
  cellIndex: number,
  card: Card
): BoardState => {
  const newBoardState = [...boardState];
  newBoardState[cellIndex] = [...newBoardState[cellIndex], card];
  return newBoardState;
};

export const getNextPlayerTurn = (currentPlayer: PlayerEnum): PlayerEnum => {
  return currentPlayer === PlayerEnum.PLAYER1
    ? PlayerEnum.PLAYER2
    : PlayerEnum.PLAYER1;
};

export const calculateScores = (
  boardState: BoardState
): { [key in PlayerEnum]: number } => {
  const newScores = { [PlayerEnum.PLAYER1]: 0, [PlayerEnum.PLAYER2]: 0 };
  boardState.forEach((cellStack) => {
    if (cellStack.length > 0) {
      const topCard = cellStack[cellStack.length - 1];
      if (topCard.color === ColorEnum.RED) {
        newScores[PlayerEnum.PLAYER1]++;
      } else if (topCard.color === ColorEnum.BLACK) {
        newScores[PlayerEnum.PLAYER2]++;
      }
    }
  });
  return newScores;
};

export const isGameOver = (players: {
  [key in PlayerEnum]: Player;
}): boolean => {
  return Object.values(players).every(
    (player) => player.hand.length === 0 && player.deck.length === 0
  );
};

export const getValidMoves = (
  player: Player,
  playerId: PlayerEnum,
  boardState: BoardState,
  boardSize: number,
  isFirst: boolean,
  startingIndices: StartingIndices,
  tieBreaker: boolean
): Move[] => {
  return player.hand.flatMap((card, cardIndex) =>
    calculateValidMoves(
      cardIndex,
      playerId,
      boardState,
      boardSize,
      isFirst,
      player.hand,
      startingIndices,
      tieBreaker
    ).map((cellIndex) => ({ cellIndex, cardIndex }))
  );
};
