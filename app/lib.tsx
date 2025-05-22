// lib.tsx
'use client';

import React, {
    forwardRef,
    useRef,
    useEffect,
    useState,
    useCallback,
    useReducer,
    PointerEvent as Ptr,
    MouseEvent,
} from 'react';
import type { Reducer } from 'react';
import styles from './page.module.css';

/* ──────────────────────────
   Constants & branded types
   ────────────────────────── */
export type BoardDimension = number & { __brand: 'BoardDimension' };
export const BOARD_ROWS = 7 as BoardDimension;
export const BOARD_COLS = 5 as BoardDimension;

export type CellIndex = number & { __brand: 'CellIndex' };
export type PixelPosition = number & { __brand: 'PixelPosition' };

export const RED_SRC = ((BOARD_ROWS - 1) * BOARD_COLS) as CellIndex;
export const RED_DST = [31, 32, 33] as CellIndex[];
export const BLK_SRC = (BOARD_COLS - 1) as CellIndex;
export const BLK_DST = [3, 2, 1] as CellIndex[];
export const DEAL_DELAY_MS = 1_000;

/* Cell type definitions */
export enum CellType {
    DECK = 'DECK',
    HAND = 'HAND',
    BOARD = 'BOARD'
}

export interface CellConfig {
    type: CellType;
    color?: 'red' | 'black';
    indices: CellIndex[];
}

export const CELL_CONFIGS: Record<string, CellConfig> = {
    RED_DECK: { type: CellType.DECK, color: 'red', indices: [RED_SRC] },
    BLACK_DECK: { type: CellType.DECK, color: 'black', indices: [BLK_SRC] },
    RED_HAND: { type: CellType.HAND, color: 'red', indices: RED_DST },
    BLACK_HAND: { type: CellType.HAND, color: 'black', indices: BLK_DST }
};

/* handy helpers */
export const DECK_CELLS = [RED_SRC, BLK_SRC] as const;
const HAND_CELLS: CellIndex[] = [...RED_DST, ...BLK_DST];

export function getCellType(idx: CellIndex): CellType {
    if (DECK_CELLS.includes(idx)) return CellType.DECK;
    if (HAND_CELLS.includes(idx)) return CellType.HAND;
    return CellType.BOARD;
}

export function getCellConfig(idx: CellIndex): CellConfig | undefined {
    return Object.values(CELL_CONFIGS).find(config =>
        config.indices.includes(idx)
    );
}

export function isDeckCell(idx: CellIndex): boolean {
    return getCellType(idx) === CellType.DECK;
}

export function isHandCell(idx: CellIndex): boolean {
    return getCellType(idx) === CellType.HAND;
}

export function isRedCell(idx: CellIndex): boolean {
    const config = getCellConfig(idx);
    return config?.color === 'red';
}

export function isBlackCell(idx: CellIndex): boolean {
    const config = getCellConfig(idx);
    return config?.color === 'black';
}

/** Utility function to check if a cell is of a specific type */
export function isCellType(idx: CellIndex, type: CellType): boolean {
    return getCellType(idx) === type;
}

/** Utility function to check if a cell is of a specific color */
export function isCellColor(idx: CellIndex, color: 'red' | 'black'): boolean {
    const config = getCellConfig(idx);
    return config?.color === color;
}

/* ──────────────────────────
   Card domain
   ────────────────────────── */
export const SUITS = {
    Clubs: 'Clubs',
    Diamonds: 'Diamonds',
    Hearts: 'Hearts',
    Spades: 'Spades',
} as const;
export type Suit = (typeof SUITS)[keyof typeof SUITS];

export const RANKS = {
    Two: 'Two', Three: 'Three', Four: 'Four',
    Five: 'Five', Six: 'Six', Seven: 'Seven',
    Eight: 'Eight', Nine: 'Nine', Ten: 'Ten',
    Jack: 'Jack', Queen: 'Queen', King: 'King', Ace: 'Ace',
} as const;
export type Rank = (typeof RANKS)[keyof typeof RANKS];

export interface Card {
    suit: Suit;
    rank: Rank;
    faceUp: boolean;
}
export type Cards = Card[];

export const SUIT_COLOR: Record<Suit, 'black' | 'red'> = {
    [SUITS.Clubs]: 'black',
    [SUITS.Spades]: 'black',
    [SUITS.Hearts]: 'red',
    [SUITS.Diamonds]: 'red',
};
export const cardColor = (suit: Suit) => SUIT_COLOR[suit];

/* ──────────────────────────
   Build starting piles
   ────────────────────────── */
export function makeStartingCells(): Cards[] {
    const cells = Array.from(
        { length: BOARD_ROWS * BOARD_COLS },
        () => [] as Cards,
    );

    const push = (cell: CellIndex, suit: Suit, rank: Rank) =>
        cells[cell].push({ suit, rank, faceUp: false });

    Object.values(RANKS).forEach(rank => {
        [SUITS.Hearts, SUITS.Diamonds].forEach(s => push(RED_SRC, s, rank));
        [SUITS.Clubs, SUITS.Spades].forEach(s => push(BLK_SRC, s, rank));
    });

    return cells;
}

/* ──────────────────────────
   Board reducer & actions
   ────────────────────────── */
export interface BoardState {
    cells: Cards[];
    dragSrc: CellIndex | null;
}
export type BoardAction =
    | { type: 'MOVE'; from: CellIndex; to: CellIndex }
    | { type: 'SWAP'; a: CellIndex; b: CellIndex }
    | { type: 'START_DRAG'; src: CellIndex }
    | { type: 'END_DRAG' }
    | { type: 'REVEAL'; indices: CellIndex[] }
    | { type: 'DEAL'; from: CellIndex; to: CellIndex };

const shouldKeepFaceDown = (from: CellIndex, dstRow: number): boolean =>
    isHandCell(from) || (isDeckCell(from) && isBlackCell(from) && dstRow === 0);

export const moveCardInCells = (cells: Cards[], from: CellIndex, to: CellIndex) => {
    if (from === to) return cells;
    const next = cells.map(s => [...s]) as Cards[];
    const card = next[from].pop();
    if (card) {
        const dstRow = Math.floor(to / BOARD_COLS);
        card.faceUp = RED_DST.includes(to) ? true : !shouldKeepFaceDown(from, dstRow);
        next[to].push(card);
    }
    return next;
};

const swapCardsInCells = (cells: Cards[], a: CellIndex, b: CellIndex) => {
    if (a === b) return cells;
    const next = cells.map(s => [...s]) as Cards[];
    const cardA = next[a].pop();
    const cardB = next[b].pop();
    if (cardA) next[b].push(cardA);
    if (cardB) next[a].push(cardB);
    return next;
};

export const reducer: Reducer<BoardState, BoardAction> = (state, action) => {
    switch (action.type) {
        case 'MOVE':
            return {
                cells: moveCardInCells(state.cells, action.from, action.to),
                dragSrc: null,
            };
        case 'SWAP':
            return {
                cells: swapCardsInCells(state.cells, action.a, action.b),
                dragSrc: null,
            };
        case 'START_DRAG':
            return { ...state, dragSrc: action.src };
        case 'END_DRAG':
            return { ...state, dragSrc: null };
        case 'REVEAL': {
            const next = state.cells.map(stack => stack.map(c => ({ ...c })));
            action.indices.forEach(idx => {
                const stack = next[idx];
                if (stack.length) {
                    stack[stack.length - 1].faceUp = true;
                }
            });
            return { cells: next, dragSrc: null };
        }
        case 'DEAL':
            return {
                cells: moveCardInCells(state.cells, action.from, action.to),
                dragSrc: state.dragSrc,
            };
        default:
            return state;
    }
};

/* ──────────────────────────
   DOM helpers
   ────────────────────────── */
type StyleKV = Partial<CSSStyleDeclaration>;
const setStyle = (el: HTMLElement, kv: StyleKV) => Object.assign(el.style, kv);

const ORIGIN_CLEAR: StyleKV = {
    position: '', left: '', top: '', zIndex: '',
    width: '', height: '', transition: '', pointerEvents: '',
};
export const clearStyles = (el: HTMLElement) => setStyle(el, ORIGIN_CLEAR);

export interface Origin {
    x: PixelPosition; y: PixelPosition; cell: CellIndex;
    offX: PixelPosition; offY: PixelPosition;
}

export const setPos = (
    el: HTMLElement | null,
    o: Origin | null,
    e: PointerEvent,
) => el && o && setStyle(el, {
    left: `${e.clientX - o.offX}px`,
    top: `${e.clientY - o.offY}px`,
});

export const snapBack = (el: HTMLElement, o: Origin, ms = 250) => {
    setStyle(el, {
        left: `${o.x}px`, top: `${o.y}px`,
        transition: `left ${ms}ms ease, top ${ms}ms ease`,
    });
    el.addEventListener('transitionend', () => clearStyles(el), { once: true });
};

/* ──────────────────────────
   Hook: useSnapDrag
   ────────────────────────── */
type DropFn = (from: CellIndex, to: CellIndex) => void;
export function useSnapDrag(
    onDrop: DropFn,
    canDrop?: (from: CellIndex, to: CellIndex) => boolean,
) {
    const elRef = useRef<HTMLElement | null>(null);
    const origRef = useRef<Origin | null>(null);
    const moveRef = useRef<((e: PointerEvent) => void) | null>(null);

    const isActive = () => elRef.current && origRef.current;
    const destCell = (e: PointerEvent): CellIndex =>
        Number(
            document
                .elementFromPoint(e.clientX, e.clientY)
                ?.closest('[data-cell]')
                ?.getAttribute('data-cell') ?? origRef.current!.cell,
        ) as CellIndex;

    const pointerUp = (e: PointerEvent) => {
        if (!isActive()) return;
        const el = elRef.current!;
        const o = origRef.current!;
        const dst = destCell(e);
        const allowed = canDrop ? canDrop(o.cell, dst) : true;

        if (!allowed || dst === o.cell) {
            snapBack(el, o);
        } else {
            clearStyles(el);
            onDrop(o.cell, dst);
        }

        if (moveRef.current)
            document.removeEventListener('pointermove', moveRef.current);
        document.removeEventListener('pointerup', pointerUp);
        moveRef.current = elRef.current = origRef.current = null;
    };

    const down = (evt: React.PointerEvent<HTMLElement>, idx: CellIndex) => {
        const el = evt.currentTarget;
        const box = el.getBoundingClientRect();
        origRef.current = {
            x: box.left as PixelPosition,
            y: box.top as PixelPosition,
            cell: idx,
            offX: (evt.clientX - box.left) as PixelPosition,
            offY: (evt.clientY - box.top) as PixelPosition,
        };
        elRef.current = el;
        setStyle(el, {
            position: 'fixed',
            left: `${box.left}px`,
            top: `${box.top}px`,
            width: `${box.width}px`,
            height: `${box.height}px`,
            zIndex: '10',
            transition: 'none',
            pointerEvents: 'none',
        });

        moveRef.current = e => setPos(elRef.current, origRef.current, e);
        document.addEventListener('pointermove', moveRef.current);
        document.addEventListener('pointerup', pointerUp);
    };

    return { down };
}

/* ──────────────────────────
   Flights reducer
   ────────────────────────── */
export interface Flight {
    id: string;
    src: CellIndex;
    dst: CellIndex;
    start: DOMRect;
    end: DOMRect;
}
export type Flights = Flight[];

type FlightAction =
    | { type: 'ADD'; payload: Flight }
    | { type: 'REMOVE'; id: string };

export const flightsReducer = (l: Flights, a: FlightAction): Flights =>
    a.type === 'ADD' ? [...l, a.payload] : l.filter(f => f.id !== a.id);

/* ──────────────────────────
   Presentational components
   ────────────────────────── */
export const CardView = ({
    card,
    onDown,
}: {
    card: Card;
    onDown: (e: Ptr<HTMLElement>) => void;
}) => (
    <div
        className={`${styles.card} ${card.faceUp ? '' : styles.back}`}
        style={card.faceUp ? { color: cardColor(card.suit) } : undefined}
        onPointerDown={onDown}
        role="img"
    >
        {card.faceUp ? (
            <>
                <div>{card.rank}</div>
                <div>{card.suit}</div>
            </>
        ) : (
            <>
                <span>🂠</span>
                <div>{card.rank}</div>
                <div>{card.suit}</div>
            </>
        )}
    </div>
);

export const Cell = forwardRef<
    HTMLDivElement,
    {
        idx: CellIndex;
        stack: Cards;
        hidden: number;
        dragSrc: CellIndex | null;
        isDragging: boolean;
        highlight?: boolean;
        onDown: (e: Ptr<HTMLElement>, idx: CellIndex) => void;
        onClick?: (e: MouseEvent<HTMLElement>, idx: CellIndex) => void;
    }
>((p, ref) => {
    const {
        idx,
        stack,
        hidden,
        dragSrc,
        isDragging,
        highlight = false,
        onDown,
        onClick,
    } = p;
    const top = stack[stack.length - 1 - hidden];
    const next = stack[stack.length - 2 - hidden];

    const isDeck = idx === RED_SRC || idx === BLK_SRC;
    const isBlackTop = top && cardColor(top.suit) === 'black';
    const inactive = isDeck || isBlackTop;

    const cls = `${styles.cell} ${highlight ? styles.highlight : ''}`;
    const cellStyle = inactive ? { pointerEvents: 'none' as const } : undefined;
    const down = inactive ? () => { } : (e: Ptr<HTMLElement>) => onDown(e, idx);
    const click = inactive ? undefined : onClick;

    return (
        <div
            ref={ref}
            data-cell={idx}
            className={cls}
            role="generic"
            style={cellStyle}
            onClick={click && ((e) => click(e, idx))}
        >
            {top && <CardView card={top} onDown={down} />}
            {next && isDragging && dragSrc === idx && (
                <CardView card={next} onDown={down} />
            )}
        </div>
    );
});
Cell.displayName = 'Cell';

export function FlyingCard({
    flight,
    onFinish,
}: {
    flight: Flight;
    onFinish: () => void;
}) {
    const [style, setStyle] = useState<React.CSSProperties>(() => ({
        position: 'fixed',
        left: flight.start.left,
        top: flight.start.top,
        width: flight.start.width,
        height: flight.start.height,
        transition: 'left 250ms ease, top 250ms ease',
    }));

    useEffect(() => {
        const id = requestAnimationFrame(() =>
            setStyle(s => ({
                ...s,
                left: flight.end.left,
                top: flight.end.top,
            })),
        );
        return () => cancelAnimationFrame(id);
    }, [flight.end]);

    const done = useRef(false);
    const handleEnd = () => {
        if (done.current) return;
        done.current = true;
        onFinish();
    };

    return (
        <div
            className={`${styles.card} ${styles.back} ${styles.flying}`}
            style={style}
            onTransitionEnd={handleEnd}
            data-flight-id={flight.id}
        >
            <span>🂠</span>
        </div>
    );
}

/* ──────────────────────────
   Game Rules & Movement Systems
   ────────────────────────── */
export interface GameState {
    /** Array of card stacks, where each stack is an array of cards */
    cells: Cards[];
    /** Set of cell indices that represent the red player's hand positions */
    redHand: Set<CellIndex>;
    /** Whether this is the first move of the red player */
    isFirstRedMove: boolean;
    /** The center cell index of the red player's home row */
    redHomeCenter: CellIndex;
    /** The center cell index of the black player's home row */
    blackHomeCenter: CellIndex;
}

export interface GameRules {
    /** Determines if a card can be moved from one cell to another */
    canMoveCard(from: CellIndex, to: CellIndex, state: GameState): boolean;
    /** Determines if a card should remain face down after being moved */
    shouldKeepFaceDown(from: CellIndex, to: CellIndex, state: GameState): boolean;
    /** Returns a set of valid destination cells for a given source cell */
    getValidDestinations(from: CellIndex, state: GameState): Set<CellIndex>;
}

export interface CardMovement {
    /** Moves a card from one cell to another */
    move(from: CellIndex, to: CellIndex, state: GameState): void;
    /** Deals a card from one cell to another */
    deal(from: CellIndex, to: CellIndex, state: GameState): void;
    /** Swaps cards between two cells */
    swap(a: CellIndex, b: CellIndex, state: GameState): void;
}

/* Default game rules implementation */
export const defaultGameRules: GameRules = {
    canMoveCard(from, to, state) {
        return canDrop(
            from,
            to,
            state.redHand,
            state.isFirstRedMove,
            state.redHomeCenter,
            state.cells
        );
    },
    shouldKeepFaceDown(from, to, state) {
        const dstRow = Math.floor(to / BOARD_COLS);
        const isFromHand = state.redHand.has(from);
        const isBlackDeckToFirstRow = from === BLK_SRC && dstRow === 0;
        return isFromHand || isBlackDeckToFirstRow;
    },
    getValidDestinations(from, state) {
        const { redHand, isFirstRedMove, redHomeCenter } = state;
        if (!redHand.has(from)) {
            return new Set();
        }
        if (isFirstRedMove) {
            return new Set([redHomeCenter]);
        }
        return getSubsequentMoveDestinations(redHand);
    }
};

/* Default card movement implementation */
export const defaultCardMovement: CardMovement = {
    move(from, to, state) {
        if (from === to) return;
        const card = state.cells[from].pop();
        if (card) {
            card.faceUp = RED_DST.includes(to) ? true :
                !defaultGameRules.shouldKeepFaceDown(from, to, state);
            state.cells[to].push(card);
        }
    },

    deal(from, to, state) {
        defaultCardMovement.move(from, to, state);
    },

    swap(a, b, state) {
        if (a === b) return;
        const cardA = state.cells[a].pop();
        const cardB = state.cells[b].pop();
        if (cardA) state.cells[b].push(cardA);
        if (cardB) state.cells[a].push(cardB);
    }
};

/* ──────────────────────────
   Move Validation
   ────────────────────────── */
export function canDropFirstMove(
    from: CellIndex,
    to: CellIndex,
    redHand: Set<CellIndex>,
    redHomeCenter: CellIndex,
    cells: Cards[],
): boolean {
    // Handle home center moves
    if (from === redHomeCenter) {
        return redHand.has(to);
    }
    // Handle hand position moves
    if (redHand.has(from)) {
        // Only allow moving to home center if it's empty
        return to === redHomeCenter && cells[redHomeCenter].length === 0;
    }
    // Allow all other moves
    return true;
}

export function canDrop(
    from: CellIndex,
    to: CellIndex,
    redHand: Set<CellIndex>,
    isFirstRedMove: boolean,
    redHomeCenter: CellIndex,
    cells: Cards[],
): boolean {
    // Always allow hand-to-hand moves
    if (redHand.has(from) && redHand.has(to)) return true;
    // Use canDropFirstMove for all moves during first red move
    if (isFirstRedMove) {
        return canDropFirstMove(from, to, redHand, redHomeCenter, cells);
    }
    // All other moves are allowed
    return true;
}

/* ──────────────────────────
   Card Movement Handlers
   ────────────────────────── */
export function handleCardMove(
    from: CellIndex,
    to: CellIndex,
    state: GameState,
    boardMove: (from: CellIndex, to: CellIndex) => void,
    boardSwap: (from: CellIndex, to: CellIndex) => void
): void {
    const isOccupiedHand = state.redHand.has(to) && state.cells[to].length > 0;

    // Handle hand-to-hand moves
    if (state.redHand.has(from) && state.redHand.has(to)) {
        boardSwap(from, to);
        return;
    }

    // Handle moves to occupied hand positions
    if (isOccupiedHand) {
        // Find an empty hand position
        const emptyHandPos = Array.from(state.redHand).find(idx => state.cells[idx].length === 0);
        if (emptyHandPos !== undefined) {
            // Swap the card in the occupied position to the empty position
            boardSwap(to, emptyHandPos);
            // Then move the card from source to the now-empty position
            boardMove(from, to);
            return;
        }
    }

    // Handle regular moves
    boardMove(from, to);
}

export function handleFlightComplete(
    from: CellIndex,
    to: CellIndex,
    boardDeal: (from: CellIndex, to: CellIndex) => void,
    moveCard: (from: CellIndex, to: CellIndex) => void,
) {
    if (DECK_CELLS.includes(from) || BLK_DST.includes(from)) {
        boardDeal(from, to);
    } else {
        moveCard(from, to);
    }
}

/* ──────────────────────────
   Bot play, validation, hooks
   ────────────────────────── */
export function makeBotMove(
    cells: Array<Array<{ suit: string; rank: string; faceUp: boolean }>>,
    addFlight: (src: CellIndex, dst: CellIndex) => void,
    blackDestinations: CellIndex[],
    blackHomeCenter: CellIndex,
) {
    const available = blackDestinations.filter(idx => cells[idx].length > 0);
    if (!available.length) return;
    const src = available[Math.floor(Math.random() * available.length)] as CellIndex;
    addFlight(src, blackHomeCenter);
}

const isValidSource = (idx: CellIndex, redHand: Set<CellIndex>): boolean =>
    redHand.has(idx);

// Cache for subsequent move destinations
const subsequentMoveDestinationsCache = new Map<string, Set<CellIndex>>();

export function getSubsequentMoveDestinations(redHand: Set<CellIndex>): Set<CellIndex> {
    // Create a cache key from the red hand indices
    const cacheKey = Array.from(redHand).sort().join(',');

    // Check if we have a cached result
    const cached = subsequentMoveDestinationsCache.get(cacheKey);
    if (cached) return cached;

    // Calculate the result
    const allowed = new Set<CellIndex>();
    for (let i = 0; i < BOARD_ROWS * BOARD_COLS; i++) {
        const id = i as CellIndex;
        if (id !== RED_SRC && id !== BLK_SRC && !redHand.has(id)) {
            allowed.add(id);
        }
    }

    // Cache the result
    subsequentMoveDestinationsCache.set(cacheKey, allowed);
    return allowed;
}

export function getAllowedMoves(
    idx: CellIndex,
    redHand: Set<CellIndex>,
    firstRedMove: boolean,
    redHomeCenter: CellIndex,
    cells: Cards[],
): Set<CellIndex> {
    if (!isValidSource(idx, redHand)) return new Set();
    if (firstRedMove) {
        // Only allow moving to home center if it's empty
        return cells[redHomeCenter].length === 0 ? new Set([redHomeCenter]) : new Set();
    }
    return getSubsequentMoveDestinations(redHand);
}

export function useHandleDown(
    firstRedMove: React.RefObject<boolean>,
    redHand: Set<CellIndex>,
    redHomeCenter: CellIndex,
    blackHomeCenter: CellIndex,
    boardReveal: (indices: CellIndex[]) => void,
    setHighlightCells: (cells: Set<CellIndex>) => void,
    startDrag: (idx: CellIndex) => void,
    drag: { down: (e: React.PointerEvent<HTMLElement>, idx: CellIndex) => void },
    cells: Cards[]
) {
    return useCallback((e: React.PointerEvent<HTMLElement>, idx: CellIndex) => {
        // Early return if trying to interact with red home center after first move
        if (!firstRedMove.current && idx === redHomeCenter) {
            return;
        }

        // Handle cells in the red hand or the red home center during first move
        if (redHand.has(idx) || (firstRedMove.current && idx === redHomeCenter)) {
            const allowedMoves = getAllowedMoves(
                idx,
                redHand,
                firstRedMove.current,
                redHomeCenter,
                cells
            );
            setHighlightCells(allowedMoves);
            startDrag(idx);
            drag.down(e, idx);
        }
    }, [
        firstRedMove,
        redHand,
        redHomeCenter,
        setHighlightCells,
        startDrag,
        drag,
        cells
    ]);
}

// Add rank comparison utilities
export type RankComparisonResult = 'tie' | 'red-wins' | 'black-wins';

/** Ordered rank values for comparison (Two is lowest, Ace is highest) */
export const RANK_VALUES: Record<Rank, number> = {
    Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8,
    Nine: 9, Ten: 10, Jack: 11, Queen: 12, King: 13, Ace: 14
};

/**
 * Compare the ranks of two cards and return the winner
 * @param redCard The red player's card
 * @param blackCard The black player's card
 * @returns The result of the comparison
 */
export function compareCardRanks(redCard: Card, blackCard: Card): RankComparisonResult {
    const redRankValue = RANK_VALUES[redCard.rank];
    const blackRankValue = RANK_VALUES[blackCard.rank];

    if (redRankValue === blackRankValue) {
        return 'tie';
    }

    // Lower rank wins in this game
    return redRankValue < blackRankValue ? 'red-wins' : 'black-wins';
}

/**
 * Finds the first empty position in a hand
 * @param handIndices Array of cell indices representing a player's hand
 * @param cells The current game cells
 * @returns The first empty cell index or undefined if no empty cells
 */
export function findEmptyHandPosition(
    handIndices: CellIndex[],
    cells: Cards[]
): CellIndex | undefined {
    return handIndices.find(idx => cells[idx].length === 0) as CellIndex | undefined;
}

/**
 * Handle the rank comparison after the first move and deal cards accordingly
 * @param cells The current game cells
 * @param redHomeCenter The red player's home center index
 * @param blackHomeCenter The black player's home center index
 * @param addFlight Function to add a flight animation
 */
export function handleRankComparison(
    cells: Cards[],
    redHomeCenter: CellIndex,
    blackHomeCenter: CellIndex,
    addFlight: (src: CellIndex, dst: CellIndex) => void
): void {
    const redCard = cells[redHomeCenter][cells[redHomeCenter].length - 1];
    const blackCard = cells[blackHomeCenter][cells[blackHomeCenter].length - 1];

    if (!redCard || !blackCard) return;

    const result = compareCardRanks(redCard, blackCard);

    switch (result) {
        case 'tie': {
            // Both players get a card
            const emptyRedHand = findEmptyHandPosition(RED_DST, cells);
            const emptyBlackHand = findEmptyHandPosition(BLK_DST, cells);

            if (emptyRedHand) {
                setTimeout(() => addFlight(RED_SRC, emptyRedHand), DEAL_DELAY_MS);
            }

            if (emptyBlackHand) {
                setTimeout(() => addFlight(BLK_SRC, emptyBlackHand), DEAL_DELAY_MS);
            }
            break;
        }
        case 'red-wins': {
            // Red player gets a card
            const emptyRedHand = findEmptyHandPosition(RED_DST, cells);
            if (emptyRedHand) {
                setTimeout(() => addFlight(RED_SRC, emptyRedHand), DEAL_DELAY_MS);
            }
            break;
        }
        case 'black-wins': {
            // Black player gets a card
            const emptyBlackHand = findEmptyHandPosition(BLK_DST, cells);
            if (emptyBlackHand) {
                setTimeout(() => addFlight(BLK_SRC, emptyBlackHand), DEAL_DELAY_MS);
            }
            break;
        }
    }
}

export function useHandleClick(
    firstRedMove: React.RefObject<boolean>,
    redHomeCenter: CellIndex,
    blackHomeCenter: CellIndex,
    boardReveal: (indices: CellIndex[]) => void,
    setHighlightCells: (cells: Set<CellIndex>) => void,
    cells: Cards[],
    addFlight: (src: CellIndex, dst: CellIndex) => void,
) {
    return useCallback(
        (e: MouseEvent<HTMLElement>, idx: CellIndex) => {
            if (firstRedMove.current && idx === redHomeCenter) {
                boardReveal([redHomeCenter, blackHomeCenter]);
                firstRedMove.current = false;
                setHighlightCells(new Set());
                handleRankComparison(cells, redHomeCenter, blackHomeCenter, addFlight);
            }
        },
        [firstRedMove, redHomeCenter, blackHomeCenter, boardReveal, setHighlightCells, cells, addFlight],
    );
}

export function useFlights(
    cellRefs: React.RefObject<(HTMLDivElement | null)[]>,
    onComplete: (from: CellIndex, to: CellIndex) => void,
) {
    const [flights, dispatch] = useReducer(flightsReducer, []);

    const addFlight = useCallback((src: CellIndex, dst: CellIndex) => {
        const srcEl = cellRefs.current[src];
        const dstEl = cellRefs.current[dst];
        if (!srcEl || !dstEl) return;
        const id = Math.random().toString(36).slice(2);
        dispatch({
            type: 'ADD',
            payload: {
                id,
                src,
                dst,
                start: srcEl.getBoundingClientRect(),
                end: dstEl.getBoundingClientRect(),
            },
        });
    }, [cellRefs]);

    const completeFlight = useCallback((flight: Flight) => {
        dispatch({ type: 'REMOVE', id: flight.id });
        onComplete(flight.src, flight.dst);
    }, [onComplete]);

    const hiddenByCell = useCallback((idx: CellIndex) => {
        return flights.filter(f => f.src === idx).length;
    }, [flights]);

    return { flights, addFlight, completeFlight, hiddenByCell };
}

export function useBoard() {
    const [state, dispatch] = useReducer(reducer, undefined, () => ({
        cells: makeStartingCells(),
        dragSrc: null,
    }));
    return {
        ...state,
        startDrag: (src: CellIndex) => dispatch({ type: 'START_DRAG', src }),
        endDrag: () => dispatch({ type: 'END_DRAG' }),
        move: (from: CellIndex, to: CellIndex) =>
            dispatch({ type: 'MOVE', from, to }),
        swap: (a: CellIndex, b: CellIndex) =>
            dispatch({ type: 'SWAP', a, b }),
        reveal: (indices: CellIndex[]) =>
            dispatch({ type: 'REVEAL', indices }),
        deal: (from: CellIndex, to: CellIndex) =>
            dispatch({ type: 'DEAL', from, to }),
    };
}
