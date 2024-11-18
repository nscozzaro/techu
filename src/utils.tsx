import {
  Card,
  ColorEnum,
  Deck,
  Hand,
  Player,
  PlayerEnum,
  RankEnum,
  SuitEnum,
  BoardState,
} from './types';

export const shuffle = (deck: Deck): void => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
};

export const getAdjacentIndices = (index: number, boardSize: number): number[] => {
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
  const rankOrder: { [key in RankEnum]: number } = {
    [RankEnum.TWO]: 2,
    [RankEnum.THREE]: 3,
    [RankEnum.FOUR]: 4,
    [RankEnum.FIVE]: 5,
    [RankEnum.SIX]: 6,
    [RankEnum.SEVEN]: 7,
    [RankEnum.EIGHT]: 8,
    [RankEnum.NINE]: 9,
    [RankEnum.TEN]: 10,
    [RankEnum.JACK]: 11,
    [RankEnum.QUEEN]: 12,
    [RankEnum.KING]: 13,
    [RankEnum.ACE]: 14,
  };
  return rankOrder[rank];
};

export const createDeck = (color: ColorEnum, owner: PlayerEnum): Deck => {
  const suits =
    color === ColorEnum.RED ? [SuitEnum.HEARTS, SuitEnum.DIAMONDS] : [SuitEnum.CLUBS, SuitEnum.SPADES];
  const ranks = Object.values(RankEnum);
  return suits.flatMap((suit) =>
    ranks.map((rank) => ({ suit, rank, color, owner }))
  );
};

export const initializePlayer = (color: ColorEnum, id: PlayerEnum): Player => {
  const deck = createDeck(color, id);
  shuffle(deck);
  return {
    id,
    hand: [deck[0], deck[1], deck[2]],
    deck: deck.slice(3),
  };
};

export const drawCardForPlayer = (player: Player): void => {
  const emptySlot = player.hand.findIndex((slot) => slot === null);
  if (player.deck.length > 0 && emptySlot !== -1) {
    const card = player.deck.pop()!;
    player.hand[emptySlot] = card;
  }
};

export const isSelectedCardGreaterThanTopCard = (selectedCard: Card, topCard: Card | undefined): boolean => {
  return !topCard || getCardRank(selectedCard.rank) > getCardRank(topCard.rank);
};

export const getHomeRowIndices = (playerType: PlayerEnum, boardSize: number): { start: number; end: number } => {
  return playerType === PlayerEnum.PLAYER1
    ? { start: boardSize * (boardSize - 1), end: boardSize * boardSize }
    : { start: 0, end: boardSize };
};

export const exploreConnectedCells = (
  initialCells: number[],
  boardState: BoardState,
  boardSize: number,
  color: ColorEnum
): Set<number> => {
  const visited = new Set<number>();
  const queue = [...initialCells];
  initialCells.forEach((cell) => visited.add(cell));

  while (queue.length > 0) {
    const currentIndex = queue.shift()!;
    const adjacentIndices = getAdjacentIndices(currentIndex, boardSize);
    adjacentIndices.forEach((adjIndex) => {
      if (adjIndex >= 0 && adjIndex < boardSize * boardSize && !visited.has(adjIndex)) {
        const stack = boardState[adjIndex];
        const topCard = stack[stack.length - 1];
        if (topCard && topCard.color === color) {
          visited.add(adjIndex);
          queue.push(adjIndex);
        }
      }
    });
  }

  return visited;
};

export const findConnectedCellsToHomeRow = (
  playerType: PlayerEnum,
  boardState: BoardState,
  color: ColorEnum,
  boardSize: number
): number[] => {
  const { start, end } = getHomeRowIndices(playerType, boardSize);
  const initialCells = Array.from({ length: end - start }, (_, i) => start + i).filter((i) => {
    const topCard = boardState[i][boardState[i].length - 1];
    return topCard && topCard.color === color;
  });

  return Array.from(exploreConnectedCells(initialCells, boardState, boardSize, color));
};

export const getValidMoveIndices = (
  indices: number[],
  boardState: BoardState,
  selectedCard: Card
): number[] => {
  return indices.filter((index) => {
    const stack = boardState[index];
    const topCard = stack[stack.length - 1];
    return isSelectedCardGreaterThanTopCard(selectedCard, topCard);
  });
};

export const calculateValidMoves = (
  cardIndex: number,
  playerType: PlayerEnum,
  boardState: BoardState,
  boardSize: number,
  isFirstMove: boolean,
  hand: Hand,
  middleHomeRowIndexPlayer1: number,
  middleHomeRowIndexPlayer2: number
): number[] => {
  const isPlayer2 = playerType === PlayerEnum.PLAYER2;
  const selectedCard = hand[cardIndex]!;
  const middleHomeRowIndex = isPlayer2 ? middleHomeRowIndexPlayer2 : middleHomeRowIndexPlayer1;

  if (isFirstMove) {
    return [middleHomeRowIndex];
  }

  const { start: homeRowStart, end: homeRowEnd } = getHomeRowIndices(playerType, boardSize);

  const homeRowIndices = Array.from({ length: homeRowEnd - homeRowStart }, (_, i) => homeRowStart + i);
  const homeRowValidIndices = getValidMoveIndices(homeRowIndices, boardState, selectedCard);

  const connectedCells = findConnectedCellsToHomeRow(
    playerType,
    boardState,
    playerType === PlayerEnum.PLAYER1 ? ColorEnum.RED : ColorEnum.BLACK,
    boardSize
  );
  const connectedValidIndices = connectedCells.flatMap((index) => {
    const adjacentIndices = getAdjacentIndices(index, boardSize);
    return getValidMoveIndices(adjacentIndices, boardState, selectedCard);
  });

  return [...homeRowValidIndices, ...connectedValidIndices];
};
