// === CONSTANTS ===
export type BoardDimension = number & { __brand: 'BoardDimension' };

export const BOARD_ROWS = 7 as BoardDimension;
export const BOARD_COLS = 5 as BoardDimension;
export const PLAYER_ROW_TOP = 0 as const;
export const PLAYER_ROW_BOTTOM = BOARD_ROWS - 1;
export const PLAYABLE_ROWS_START = 1 as const;
export const PLAYABLE_ROWS_END = BOARD_ROWS - 2;

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

export type Suit = typeof SUITS[keyof typeof SUITS];

// === SUIT COLORS ===
export const SUIT_COLOR_RED = 'red' as const;
export const SUIT_COLOR_BLACK = 'black' as const;

export type PlayerColor = typeof SUIT_COLOR_RED | typeof SUIT_COLOR_BLACK;

export const SUIT_COLORS: Record<Suit, PlayerColor> = {
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

export type Rank = typeof RANKS[keyof typeof RANKS];

type Branded<T, B> = T & { __brand: B };
export type RankValue = Branded<number, 'RankValue'>;

// === CARD ===
export interface Card {
    suit: Suit;
    rank: Rank;
}

export type Cards = Card[];

export const newCard = (suit: Suit | null, rank: Rank | null): Card | null => {
    if (suit === null || rank === null) return null;
    return { suit, rank };
};