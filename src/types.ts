// src/types.ts
import { Dispatch, SetStateAction } from 'react';

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

// New type aliases for clarity and strong typing.
export type CellIndex = number;
export type CardIndex = number;

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
  faceDown: boolean;
}

export interface Player {
  hand: Cards;
  deck: Cards;
  id: PlayerEnum;
}

export type Cards = (Card | null)[];

export type BoardState = Cards[];

export interface Move {
  type: 'board' | 'discard';
  cellIndex?: CellIndex;
  cardIndex: CardIndex;
}

export type Moves = Move[];

export type SetDeck = Dispatch<SetStateAction<Cards>>;
export type SetHand = Dispatch<SetStateAction<Cards>>;

export const BOARD_SIZE = 5;

export type StartingIndices = {
  [key in PlayerEnum]: CellIndex;
};

export const STARTING_INDICES: StartingIndices = {
  [PlayerEnum.PLAYER1]:
    BOARD_SIZE * (BOARD_SIZE - 1) + Math.floor(BOARD_SIZE / 2),
  [PlayerEnum.PLAYER2]: Math.floor(BOARD_SIZE / 2),
};

export type Players = { [key in PlayerEnum]: Player };

export type PlayerBooleans = { [key in PlayerEnum]: boolean };

export type Scores = { [key in PlayerEnum]: number };

export interface FaceDownCard extends Card {
  cellIndex: CellIndex;
}

export type InitialFaceDownCards = { [key in PlayerEnum]?: FaceDownCard };

export type DiscardPiles = { [key in PlayerEnum]: Card[] };

export const initialFirstMove = (): PlayerBooleans => ({
  [PlayerEnum.PLAYER1]: true,
  [PlayerEnum.PLAYER2]: true,
});
