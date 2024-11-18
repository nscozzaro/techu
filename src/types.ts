// types.ts

export enum PlayerEnum {
  PLAYER1 = 'PLAYER1',
  PLAYER2 = 'PLAYER2',
}

export enum ColorEnum {
  RED = 'RED',
  BLACK = 'BLACK',
}

export enum SuitEnum {
  HEARTS = '♥',
  DIAMONDS = '♦',
  CLUBS = '♣',
  SPADES = '♠',
}

export enum RankEnum {
  TWO = '2',
  THREE = '3',
  FOUR = '4',
  FIVE = '5',
  SIX = '6',
  SEVEN = '7',
  EIGHT = '8',
  NINE = '9',
  TEN = '10',
  JACK = 'J',
  QUEEN = 'Q',
  KING = 'K',
  ACE = 'A',
}

// Rank order mapping
export const rankOrder: { [key in RankEnum]: number } = {
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

export interface Card {
  suit: SuitEnum;
  rank: RankEnum;
  color: ColorEnum;
  owner: PlayerEnum;
}

export interface Player {
  hand: Hand;
  deck: Deck;
  id: PlayerEnum;
}

export type Deck = Card[];
export type Hand = (Card | null)[];

export type BoardState = Card[][];

export interface Move {
  cellIndex: number;
  cardIndex: number;
}

export type Moves = Move[];

export type SetDeck = React.Dispatch<React.SetStateAction<Deck>>;
export type SetHand = React.Dispatch<React.SetStateAction<Hand>>;

// Starting indices for players
export type StartingIndices = {
  [key in PlayerEnum]: number;
};
