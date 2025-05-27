// === CONSTANTS ===
export type BoardDimension = number & { __brand: 'BoardDimension' };
export type CellIndex = number & { __brand: 'CellIndex' };
export type RowIndex = number & { __brand: 'RowIndex' };
export type ColumnIndex = number & { __brand: 'ColumnIndex' };
export type CellIndices = CellIndex[];

export const BOARD_ROWS = 7 as BoardDimension;
export const BOARD_COLS = 5 as BoardDimension;
export const PLAYER_ROW_1 = BOARD_ROWS - 1 as RowIndex;
export const PLAYER_ROW_2 = 0 as RowIndex;
export const DECK_CELL_INDEX_1 = BOARD_ROWS * BOARD_COLS - BOARD_COLS as CellIndex;
export const DECK_CELL_INDEX_2 = 0 as CellIndex;
export const NUM_HAND_CELLS = 3;
export const HAND_CELLS_1 = Array.from({ length: NUM_HAND_CELLS }, (_, i) => DECK_CELL_INDEX_1 + i + 1) as CellIndices;
export const HAND_CELLS_2 = Array.from({ length: NUM_HAND_CELLS }, (_, i) => DECK_CELL_INDEX_2 + i + 1) as CellIndices;
export const DISCARD_CELL_INDEX_1 = BOARD_ROWS * BOARD_COLS - 1 as CellIndex;
export const DISCARD_CELL_INDEX_2 = BOARD_COLS - 1 as CellIndex;
export const PLAYABLE_CELLS = Array.from({ length: BOARD_ROWS * BOARD_COLS - 2 * BOARD_COLS }, (_, i) => i + BOARD_COLS) as CellIndices;


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

// === COMPONENTS ===
import styles from './page.module.css';

interface CardProps {
    card: Card;
}

export function Card({ card }: CardProps) {
    const { suit, rank } = card;

    return (
        <div className={styles.card}>
            <div className={styles.cardContent} style={{ color: SUIT_COLORS[suit] }}>
                <div>{rank}</div>
                <div>{suit}</div>
            </div>
        </div>
    );
}

export interface Cell {
    cards: Card[];
}

export function Cell({ cards }: Cell) {
    const topCard = cards[cards.length - 1];

    return (
        <div className={styles.cell}>
            {topCard && <Card card={topCard} />}
        </div>
    );
}

interface BoardProps {
    num_rows: BoardDimension;
    num_cols: BoardDimension;
}

export function Board({ num_rows, num_cols }: BoardProps) {
    return (
        <>
            <div className={styles.scoreRow}>
                <span>Player 1 Score: 0</span>
                <span>Player 2 Score: 0</span>
            </div>
            <div className={styles.board}>
                {Array.from({ length: num_rows * num_cols }, (_, i) => (
                    <Cell key={i} cards={[]} />
                ))}
            </div>
        </>
    );
}