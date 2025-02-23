// src/logic/deck.ts
import { Cards, ColorEnum, PlayerEnum, SuitEnum, RankEnum } from '../types';

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
 * Create a deck based on the given color and owner.
 */
export const createDeck = (color: ColorEnum, owner: PlayerEnum): Cards => {
  const suits = color === ColorEnum.RED
    ? [SuitEnum.HEARTS, SuitEnum.DIAMONDS]
    : [SuitEnum.CLUBS, SuitEnum.SPADES];
  const ranks = Object.values(RankEnum);
  return suits.flatMap(suit =>
    ranks.map(rank => ({ suit, rank, color, owner, faceDown: false }))
  );
};
