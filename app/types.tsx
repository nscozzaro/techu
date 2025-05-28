import styles from './page.module.css';

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
export const DECK_CELL_1 = BOARD_ROWS * BOARD_COLS - BOARD_COLS as CellIndex;
export const DECK_CELL_2 = 0 as CellIndex;
export const NUM_HAND_CELLS = 3;
export const HAND_CELLS_1 = Array.from({ length: NUM_HAND_CELLS }, (_, i) => DECK_CELL_1 + i + 1) as CellIndices;
export const HAND_CELLS_2 = Array.from({ length: NUM_HAND_CELLS }, (_, i) => DECK_CELL_2 + i + 1) as CellIndices;
export const DISCARD_CELL_1 = BOARD_ROWS * BOARD_COLS - 1 as CellIndex;
export const DISCARD_CELL_2 = BOARD_COLS - 1 as CellIndex;
export const PLAYABLE_CELLS = Array.from({ length: BOARD_ROWS * BOARD_COLS - 2 * BOARD_COLS }, (_, i) => i + BOARD_COLS) as CellIndices;

export const SUIT_DATA = {
    Clubs: { symbol: '♣', color: 'black' },
    Diamonds: { symbol: '♦', color: 'red' },
    Hearts: { symbol: '♥', color: 'red' },
    Spades: { symbol: '♠', color: 'black' },
} as const;

export type Suit = keyof typeof SUIT_DATA;               // 'Clubs' | 'Diamonds' | 'Hearts' | 'Spades'
export type SuitSymbol = typeof SUIT_DATA[Suit]['symbol'];     // '♣' | '♦' | '♥' | '♠'
export type SuitColor = typeof SUIT_DATA[Suit]['color'];      // 'red' | 'black'

export const SUITS = Object.keys(SUIT_DATA) as readonly Suit[];

export enum SuitEnum {
    Clubs,
    Diamonds,
    Hearts,
    Spades,
}

export const RANKS = [
    'Two', 'Three', 'Four', 'Five', 'Six',
    'Seven', 'Eight', 'Nine', 'Ten',
    'Jack', 'Queen', 'King', 'Ace',
] as const;

export type Rank = typeof RANKS[number]; // 'Two' | ... | 'Ace'

type Branded<T, B> = T & { __brand: B };
export type RankValue = Branded<number, 'RankValue'>;

export const RANK_VALUES: Record<Rank, RankValue> = RANKS.reduce(
    (accumulator, rank, i) => ({ ...accumulator, [rank]: (i + 2) as RankValue }),
    {} as Record<Rank, RankValue>
);

export type CardFaceUp = boolean;
export type CardID = `${Rank}Of${Suit}`;

export class Card {
    constructor(
        public readonly id: CardID,
        public faceUp: CardFaceUp
    ) { }

    get suit(): Suit {
        return CARD_MAP[this.id].suit;
    }

    get rank(): Rank {
        return CARD_MAP[this.id].rank;
    }

    get color(): SuitColor {
        return SUIT_DATA[this.suit].color;
    }

    get symbol(): SuitSymbol {
        return SUIT_DATA[this.suit].symbol;
    }
}

export type Cards = Card[];

export const CARD_MAP: Record<CardID, { rank: Rank; suit: Suit }> = SUITS.reduce(
    (map, suit) => {
        RANKS.forEach(rank => {
            const key = `${rank}Of${suit}` as CardID;
            map[key] = { rank, suit };
        });
        return map;
    },
    {} as Record<CardID, { rank: Rank; suit: Suit }>
);

export const CARDS = Object.keys(CARD_MAP) as readonly CardID[];

export function CardComponent({ card }: { card: Card }) {
    return (
        <div className={`${styles.card} ${card.faceUp ? styles.faceUp : styles.faceDown}`}>
            {card.faceUp ? (
                <div className={styles.cardContent} style={{ color: card.color }}>
                    <div className={styles.cardRank}>{card.rank}</div>
                    <div className={styles.cardSymbol}>{card.symbol}</div>
                </div>
            ) : (
                <div className={styles.cardBack}>
                    <div className={styles.cardRank}>{card.rank}</div>
                    <div className={styles.cardSymbol}>{card.symbol}</div>
                    <div className={styles.cardBackPattern}></div>
                </div>
            )}
        </div>
    );
}

export interface Cell {
    cards: Cards;
}

export function Cell() {
    return (
        <div className={styles.cell}>
        </div>
    );
}

export class Board {
    private cells: CellIndex[];

    constructor(
        public readonly num_rows: BoardDimension,
        public readonly num_cols: BoardDimension
    ) {
        this.cells = Array.from({ length: num_rows * num_cols }, (_, i) => i as CellIndex);
    }

    getCells(): CellIndex[] {
        return this.cells;
    }
}

export function BoardComponent({ board }: { board: Board }) {
    return (
        <>
            <div className={styles.scoreRow}>
                <span>Player 1 Score: 0</span>
                <span>Player 2 Score: 0</span>
            </div>
            <div className={styles.board}>
                {board.getCells().map((cellIndex) => (
                    <Cell key={cellIndex} />
                ))}
            </div>
        </>
    );
}

