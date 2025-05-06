// === SUITS ===

export enum SuitEnum {
    Clubs,
    Diamonds,
    Hearts,
    Spades,
}

export const SUITS = {
    Clubs: 'Clubs',
    Diamonds: 'Diamonds',
    Hearts: 'Hearts',
    Spades: 'Spades',
} as const;

export type Suit = typeof SUITS[keyof typeof SUITS]; // 'Clubs' | ...

// === SUIT COLORS ===

export const SUIT_COLOR_RED = 'red' as const;
export const SUIT_COLOR_BLACK = 'black' as const;

export type SuitColor = typeof SUIT_COLOR_RED | typeof SUIT_COLOR_BLACK;

export const SUIT_COLORS: Record<Suit, SuitColor> = {
    [SUITS.Clubs]: SUIT_COLOR_BLACK,
    [SUITS.Spades]: SUIT_COLOR_BLACK,
    [SUITS.Hearts]: SUIT_COLOR_RED,
    [SUITS.Diamonds]: SUIT_COLOR_RED,
};

// === RANKS ===

export const RANKS = {
    Two: 'Two',
    Three: 'Three',
    Four: 'Four',
    Five: 'Five',
    Six: 'Six',
    Seven: 'Seven',
    Eight: 'Eight',
    Nine: 'Nine',
    Ten: 'Ten',
    Jack: 'Jack',
    Queen: 'Queen',
    King: 'King',
    Ace: 'Ace',
} as const;

export type Rank = typeof RANKS[keyof typeof RANKS]; // 'Two' | ...

type Branded<T, B> = T & { __brand: B };
export type RankValue = Branded<number, 'RankValue'>;

export const RankValues: Record<Rank, RankValue> = {
    [RANKS.Two]: 2 as RankValue,
    [RANKS.Three]: 3 as RankValue,
    [RANKS.Four]: 4 as RankValue,
    [RANKS.Five]: 5 as RankValue,
    [RANKS.Six]: 6 as RankValue,
    [RANKS.Seven]: 7 as RankValue,
    [RANKS.Eight]: 8 as RankValue,
    [RANKS.Nine]: 9 as RankValue,
    [RANKS.Ten]: 10 as RankValue,
    [RANKS.Jack]: 11 as RankValue,
    [RANKS.Queen]: 12 as RankValue,
    [RANKS.King]: 13 as RankValue,
    [RANKS.Ace]: 14 as RankValue,
};

// === RANK DISPLAY STRINGS ===

export const RANK_NAMES = {
    Two: 'two',
    Three: 'three',
    Four: 'four',
    Five: 'five',
    Six: 'six',
    Seven: 'seven',
    Eight: 'eight',
    Nine: 'nine',
    Ten: 'ten',
    Jack: 'jack',
    Queen: 'queen',
    King: 'king',
    Ace: 'ace',
} as const;

export type RankName = typeof RANK_NAMES[keyof typeof RANK_NAMES];

export const RankToDisplayNameMap: Record<Rank, RankName> = {
    [RANKS.Two]: RANK_NAMES.Two,
    [RANKS.Three]: RANK_NAMES.Three,
    [RANKS.Four]: RANK_NAMES.Four,
    [RANKS.Five]: RANK_NAMES.Five,
    [RANKS.Six]: RANK_NAMES.Six,
    [RANKS.Seven]: RANK_NAMES.Seven,
    [RANKS.Eight]: RANK_NAMES.Eight,
    [RANKS.Nine]: RANK_NAMES.Nine,
    [RANKS.Ten]: RANK_NAMES.Ten,
    [RANKS.Jack]: RANK_NAMES.Jack,
    [RANKS.Queen]: RANK_NAMES.Queen,
    [RANKS.King]: RANK_NAMES.King,
    [RANKS.Ace]: RANK_NAMES.Ace,
};

// === CARD TYPE ===

export interface Card {
    suit: Suit;
    rank: Rank;
}

// === CARD UTILITIES ===

export const getCardColor = (card: Card): SuitColor => SUIT_COLORS[card.suit];

export const getCardValue = (card: Card): RankValue => RankValues[card.rank];

export const getCardDisplayName = (card: Card): RankName => RankToDisplayNameMap[card.rank];

export const createCard = (suit: Suit, rank: Rank): Card => { return { suit, rank } };