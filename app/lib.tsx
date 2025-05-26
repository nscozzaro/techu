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
export type BoardRow = number & { __brand: 'BoardRow' };
export const RED_HOME_ROW = BOARD_ROWS - 2 as BoardRow;
export const RED_HOME_CENTER = (RED_HOME_ROW * BOARD_COLS + Math.floor(BOARD_COLS / 2)) as CellIndex;
export const BLK_HOME_ROW = 1 as BoardRow;
export const BLK_HOME_CENTER = (BLK_HOME_ROW * BOARD_COLS + Math.floor(BOARD_COLS / 2)) as CellIndex;

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
    /** The comparison result after first move (undefined before comparison) */
    comparisonResult?: RankComparisonResult;
    /** The current player's turn ('red' or 'black') */
    currentPlayer?: 'red' | 'black';
    /** Tracks if we're in tiebreaker phase */
    isTiebreaker?: boolean;
    /** Red player home row */
    redHomeRow?: number;
    /** Black player home row */
    blackHomeRow?: number;
}

export interface GameRules {
    /** Determines if a card can be moved from one cell to another */
    canMoveCard(from: CellIndex, to: CellIndex, state: GameState): boolean;
    /** Determines if a card should remain face down after being moved */
    shouldKeepFaceDown(from: CellIndex, to: CellIndex, state: GameState): boolean;
    /** Returns a set of valid destination cells for a given source cell */
    getValidDestinations(from: CellIndex, state: GameState): Set<CellIndex>;
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
        const { cells, redHand, isFirstRedMove, redHomeCenter, currentPlayer } = state;

        // Rule 0: Current player can always swap cards within their own hand.
        // This rule takes precedence for allowing the drop action.
        let playerHandCells: Set<CellIndex>;
        if (currentPlayer === 'red') {
            playerHandCells = redHand;
        } else if (currentPlayer === 'black') {
            playerHandCells = new Set<CellIndex>(BLK_DST); // Define black player's hand
        } else {
            playerHandCells = new Set<CellIndex>(); // No current player
        }

        if (playerHandCells.has(from) && playerHandCells.has(to)) {
            return true;
        }

        // Rule 1: First Red Move specific logic
        if (isFirstRedMove) {
            return canDrop(from, to, redHand, true, redHomeCenter, cells);
        }

        // Rule 2: Post-First Move (isFirstRedMove is false)
        // For moves other than hand-to-hand swaps (covered by Rule 0).
        // These destinations are for moving cards *out* of hand to the board, or board-to-board.
        // getPostFirstMoveDestinations also includes empty hand cells as valid targets if moving from hand.
        if (playerHandCells.has(from) || !isHandCell(from)) { // If moving from player's hand or from board
            const validBoardDestinations = getPostFirstMoveDestinations(from, state);
            if (validBoardDestinations.has(to)) {
                return true;
            }
        }

        // Fallback: if none of the above conditions met, the move is not allowed.
        return false;
    },

    shouldKeepFaceDown(from, to, state) {
        const dstRow = Math.floor(to / BOARD_COLS);
        const isFromHand = state.redHand.has(from);
        const isBlackDeckToFirstRow = from === BLK_SRC && dstRow === 0;
        return isFromHand || isBlackDeckToFirstRow;
    },

    getValidDestinations(from: CellIndex, state: GameState): Set<CellIndex> {
        const { redHand, isFirstRedMove, redHomeCenter, comparisonResult } = state;

        // Case 1: First move and source is not in red hand
        if (isFirstRedMove && !redHand.has(from)) {
            return new Set();
        }
        // Case 2: First move (implicitly, source is in red hand if Case 1 was not met)
        if (isFirstRedMove) {
            return new Set([redHomeCenter]);
        }

        // Case 3: comparisonResult exists, use post-first-move specific destinations
        if (comparisonResult) {
            return getPostFirstMoveDestinations(from, state);
        }

        // Case 4: Fallback (no comparisonResult, or its path not taken), and source is not in red hand
        if (!redHand.has(from)) {
            return new Set();
        }

        // Case 5: Fallback, source is in red hand
        return getSubsequentMoveDestinations(redHand);
    },

    move(from, to, state) {
        if (from === to) return;
        const card = state.cells[from].pop();
        if (card) {
            card.faceUp = RED_DST.includes(to) ? true :
                !this.shouldKeepFaceDown(from, to, state);
            state.cells[to].push(card);
        }
    },

    deal(from, to, state) {
        this.move(from, to, state);
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
    boardSwap: (from: CellIndex, to: CellIndex) => void,
    setHighlightCells?: (cells: Set<CellIndex>) => void
): void {
    const isOccupiedHand = state.redHand.has(to) && state.cells[to].length > 0;
    const isPureHandSwap = (state.redHand.has(from) && state.redHand.has(to)) ||
        (BLK_DST.includes(from) && BLK_DST.includes(to));

    if (isPureHandSwap) {
        boardSwap(from, to);
    } else if (isOccupiedHand) {
        const emptyHandPos = Array.from(state.redHand).find(idx => state.cells[idx].length === 0);
        if (emptyHandPos !== undefined) {
            boardSwap(to, emptyHandPos);
            boardMove(from, to);
        } else {
            boardMove(from, to);
        }
    } else {
        boardMove(from, to);
    }

    // Only finish player turn if it's not a pure hand swap and certain conditions are met.
    if (!isPureHandSwap && !state.isFirstRedMove && state.currentPlayer) {
        finishPlayerTurn(state);
    }

    if (setHighlightCells) {
        setHighlightCells(new Set());
    }
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

export const isValidSource = (idx: CellIndex, redHand: Set<CellIndex>): boolean =>
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

                // Create a temporary game state for the comparison
                const gameState: GameState = {
                    cells,
                    redHand: new Set<CellIndex>(RED_DST),
                    isFirstRedMove: false,
                    redHomeCenter,
                    blackHomeCenter
                };

                handleRankComparison(cells, redHomeCenter, blackHomeCenter, addFlight, gameState);
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

/**
 * Get row and column from cell index
 * @param idx The cell index
 * @returns An object with row and col properties
 */
export function getRowCol(idx: CellIndex): { row: number; col: number } {
    return {
        row: Math.floor(idx / BOARD_COLS),
        col: idx % BOARD_COLS
    };
}

/**
 * Get cell index from row and column
 * @param row The row index
 * @param col The column index
 * @returns The cell index
 */
export function getCellIndex(row: number, col: number): CellIndex {
    return (row * BOARD_COLS + col) as CellIndex;
}

/**
 * Check if two cells are adjacent (non-diagonal)
 * @param a First cell index
 * @param b Second cell index
 * @returns True if cells are adjacent, false otherwise
 */
export function areAdjacent(a: CellIndex, b: CellIndex): boolean {
    const posA = getRowCol(a);
    const posB = getRowCol(b);

    // Same row, adjacent columns
    if (posA.row === posB.row && Math.abs(posA.col - posB.col) === 1) {
        return true;
    }

    // Same column, adjacent rows
    if (posA.col === posB.col && Math.abs(posA.row - posB.row) === 1) {
        return true;
    }

    return false;
}

/**
 * Check if a cell is in a specific row
 * @param idx The cell index
 * @param row The row to check
 * @returns True if the cell is in the specified row
 */
export function isInRow(idx: CellIndex, row: number): boolean {
    return Math.floor(idx / BOARD_COLS) === row;
}

/**
 * Check if a card can be played on top of another card
 * (only if the new card has a higher rank)
 * @param topCard The card on top of the destination cell
 * @param newCard The card being played
 * @returns True if the move is valid
 */
export function canPlayOnTop(topCard: Card, newCard: Card): boolean {
    // Can play on top if the new card has a higher rank
    return RANK_VALUES[newCard.rank] > RANK_VALUES[topCard.rank];
}

/**
 * Get adjacent destinations when there are no connected cells but there is a card in the home row
 * @param from Source cell index
 * @param homeRow Home row index
 * @param cells Current cells state
 * @returns Set of valid adjacent destination cell indices
 */
export function getAdjacentDestinationsWhenNoConnected(
    from: CellIndex,
    homeRow: number,
    cells: Cards[]
): Set<CellIndex> {
    const allowed = new Set<CellIndex>();
    const hasCardInHomeRow = checkForCardInHomeRow(homeRow, cells);
    if (hasCardInHomeRow) {
        const adjacentDests = getAdjacentHomeRowDestinations(from, homeRow, cells);
        for (const dest of adjacentDests) {
            allowed.add(dest);
        }
    }
    return allowed;
}

/**
 * Gets valid destinations during tiebreaker phase
 */
export function getTiebreakerDestinationsForCell(
    from: CellIndex,
    state: GameState
): Set<CellIndex> {
    const { cells, redHand, redHomeCenter, blackHomeCenter } = state;
    const isRedHand = redHand.has(from);
    const isBlackHand = BLK_DST.includes(from);

    if (!isRedHand && !isBlackHand) {
        return new Set();
    }

    const homeRow = isRedHand
        ? Math.floor(redHomeCenter / BOARD_COLS)
        : Math.floor(blackHomeCenter / BOARD_COLS);

    const allowed = new Set<CellIndex>();
    for (let col = 0; col < BOARD_COLS; col++) {
        const idx = getCellIndex(homeRow, col);

        // If cell is empty, it's a valid move
        if (cells[idx].length === 0) {
            allowed.add(idx);
            continue;
        }

        // If there's a card, check if we can play on top
        const topCard = cells[idx][cells[idx].length - 1];
        const newCard = cells[from][cells[from].length - 1];

        if (newCard && topCard && canPlayOnTop(topCard, newCard)) {
            allowed.add(idx);
        }
    }

    // Add hand cells as valid destinations for red player
    if (isRedHand) {
        addEmptyHandCells(allowed, redHand, cells);
    }

    return allowed;
}

/**
 * Get player-specific information based on current player
 */
export function getPlayerInfo(state: GameState): {
    isRedPlayer: boolean;
    playerHand: Set<CellIndex>;
    homeRow: number;
} {
    const { redHand, redHomeCenter, blackHomeCenter, currentPlayer } = state;

    if (!currentPlayer) {
        throw new Error('No current player in game state');
    }

    const isRedPlayer = currentPlayer === 'red';
    const playerHand = isRedPlayer ? redHand : new Set<CellIndex>(BLK_DST);
    const homeRow = isRedPlayer
        ? Math.floor(redHomeCenter / BOARD_COLS)
        : Math.floor(blackHomeCenter / BOARD_COLS);

    return { isRedPlayer, playerHand, homeRow };
}

/**
 * Adds destinations from the home row to the allowed set.
 */
function populateHomeRowDestinations(from: CellIndex, homeRow: number, cells: Cards[], allowed: Set<CellIndex>): void {
    const homeRowDests = getHomeRowDestinations(from, homeRow, cells);
    for (const dest of homeRowDests) {
        allowed.add(dest);
    }
}

/**
 * Adds destinations from cells connected to the home row to the allowed set.
 */
function populateConnectedCellDestinations(from: CellIndex, connected: Set<CellIndex>, cells: Cards[], allowed: Set<CellIndex>): void {
    const connectedDests = getConnectedCellDestinations(from, connected, cells);
    for (const dest of connectedDests) {
        allowed.add(dest);
    }
}

/**
 * Adds destinations adjacent to home row when no player-owned cards are connected in the home row.
 */
function populateAdjacentDestinationsWhenNoPlayerConnected(from: CellIndex, homeRow: number, cells: Cards[], allowed: Set<CellIndex>): void {
    const adjacentDests = getAdjacentDestinationsWhenNoConnected(from, homeRow, cells);
    for (const dest of adjacentDests) {
        allowed.add(dest);
    }
}

/**
 * Get all valid destinations for a player's move
 */
export function getAllValidDestinations(
    from: CellIndex,
    state: GameState,
    playerInfo: { isRedPlayer: boolean; playerHand: Set<CellIndex>; homeRow: number }
): Set<CellIndex> {
    const { cells } = state;
    const { isRedPlayer, playerHand, homeRow } = playerInfo;
    const allowed = new Set<CellIndex>();

    if (!playerHand.has(from)) {
        return allowed;
    }

    populateHomeRowDestinations(from, homeRow, cells, allowed);

    const connected = findConnectedCells(cells, homeRow, isRedPlayer);
    populateConnectedCellDestinations(from, connected, cells, allowed);

    if (connected.size === 0) {
        populateAdjacentDestinationsWhenNoPlayerConnected(from, homeRow, cells, allowed);
    }

    if (isRedPlayer) {
        addEmptyHandCells(allowed, playerHand, cells); // playerHand is state.redHand for red player
    }
    return allowed;
}

/**
 * Get valid destinations for normal play
 */
export function getNormalPlayDestinations(
    from: CellIndex,
    state: GameState
): Set<CellIndex> {
    try {
        const playerInfo = getPlayerInfo(state);
        return getAllValidDestinations(from, state, playerInfo);
    } catch {
        // Return empty set if there's no current player or other error
        return new Set();
    }
}

/**
 * Adds empty hand cells to the allowed destinations set
 */
export function addEmptyHandCells(
    allowed: Set<CellIndex>,
    handCells: Set<CellIndex>,
    cells: Cards[]
): void {
    handCells.forEach(idx => {
        if (cells[idx].length === 0) {
            allowed.add(idx);
        }
    });
}

export function getPostFirstMoveDestinations(
    from: CellIndex,
    state: GameState
): Set<CellIndex> {
    const { isTiebreaker } = state;

    if (isTiebreaker) {
        return getTiebreakerDestinationsForCell(from, state);
    }

    return getNormalPlayDestinations(from, state);
}

/**
 * Get valid destinations in the home row
 */
export function getHomeRowDestinations(
    from: CellIndex,
    homeRow: number,
    cells: Cards[]
): Set<CellIndex> {
    const allowed = new Set<CellIndex>();
    const newCard = cells[from][cells[from].length - 1];
    if (!newCard) return allowed;

    for (let col = 0; col < BOARD_COLS; col++) {
        const idx = getCellIndex(homeRow, col);

        if (cells[idx].length === 0) {
            allowed.add(idx);
        } else {
            // If there's a card, check if we can play on top
            const topCard = cells[idx][cells[idx].length - 1];
            const newCard = cells[from][cells[from].length - 1];

            if (newCard && topCard && canPlayOnTop(topCard, newCard)) {
                allowed.add(idx);
            }
        }
    }
    return allowed;
}

/**
 * Get valid destinations adjacent to connected cells
 */
export function getConnectedCellDestinations(
    from: CellIndex,
    connected: Set<CellIndex>,
    cells: Cards[]
): Set<CellIndex> {
    const allowed = new Set<CellIndex>();
    const newCard = cells[from][cells[from].length - 1];
    if (!newCard) return allowed;

    for (const cellIdx of connected) {
        const adjacentCells = getAdjacentCells(cellIdx);

        for (const adjIdx of adjacentCells) {
            // Skip if already added
            if (allowed.has(adjIdx)) continue;

            // Skip invalid cell types
            if (isDeckCell(adjIdx) || isHandCell(adjIdx)) continue;

            // If cell is empty, add it
            if (cells[adjIdx].length === 0) {
                allowed.add(adjIdx);
                continue;
            }

            // If there's a card, check if we can play on top
            const topCard = cells[adjIdx][cells[adjIdx].length - 1];
            const newCard = cells[from][cells[from].length - 1];

            if (newCard && topCard && canPlayOnTop(topCard, newCard)) {
                allowed.add(adjIdx);
            }
        }
    }
    return allowed;
}

/**
 * Check if there is at least one card in the home row
 */
export function checkForCardInHomeRow(homeRow: number, cells: Cards[]): boolean {
    for (let col = 0; col < BOARD_COLS; col++) {
        const idx = getCellIndex(homeRow, col);
        if (cells[idx].length > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Get valid destinations adjacent to home row cells
 */
export function getAdjacentHomeRowDestinations(
    from: CellIndex,
    homeRow: number,
    cells: Cards[]
): Set<CellIndex> {
    const allowed = new Set<CellIndex>();
    const fromCard = cells[from][cells[from].length - 1];
    if (!fromCard) return allowed;

    for (let col = 0; col < BOARD_COLS; col++) {
        const homeIdx = getCellIndex(homeRow, col);
        const adjacentCells = getAdjacentCells(homeIdx);

        for (const adjIdx of adjacentCells) {
            // Skip already added or invalid cell types
            if (allowed.has(adjIdx) || isDeckCell(adjIdx) || isHandCell(adjIdx)) {
                continue;
            }

            // If cell is empty, add it
            if (cells[adjIdx].length === 0) {
                allowed.add(adjIdx);
                continue;
            }

            // If there's a card, check if we can play on top
            const topCard = cells[adjIdx][cells[adjIdx].length - 1];
            if (topCard && RANK_VALUES[fromCard.rank] > RANK_VALUES[topCard.rank]) {
                allowed.add(adjIdx);
            }
        }
    }
    return allowed;
}

/**
 * Get all cells adjacent to the given cell
 * @param cellIdx Cell index to check
 * @returns Array of adjacent cell indices
 */
export function getAdjacentCells(cellIdx: CellIndex): CellIndex[] {
    const pos = getRowCol(cellIdx);
    const adjacent: CellIndex[] = [];

    // Check all four adjacent positions
    const adjacentPositions = [
        { row: pos.row - 1, col: pos.col }, // above
        { row: pos.row + 1, col: pos.col }, // below
        { row: pos.row, col: pos.col - 1 }, // left
        { row: pos.row, col: pos.col + 1 }  // right
    ];

    for (const adjPos of adjacentPositions) {
        // Skip if out of bounds
        if (adjPos.row < 0 || adjPos.row >= BOARD_ROWS ||
            adjPos.col < 0 || adjPos.col >= BOARD_COLS) {
            continue;
        }

        adjacent.push(getCellIndex(adjPos.row, adjPos.col));
    }

    return adjacent;
}

/**
 * Checks if a card belongs to a player based on its suit color
 */
export function isCardOwnedByPlayer(card: Card, isRedPlayer: boolean): boolean {
    const isCardRed = SUIT_COLOR[card.suit] === 'red';
    return (isRedPlayer && isCardRed) || (!isRedPlayer && !isCardRed);
}

/**
 * Gets the initial connected cells from the home row
 */
export function getInitialConnectedCells(
    cells: Cards[],
    homeRow: number,
    isRedPlayer: boolean
): { connected: Set<CellIndex>; queue: CellIndex[]; visited: Set<CellIndex> } {
    const connected = new Set<CellIndex>();
    const queue: CellIndex[] = [];
    const visited = new Set<CellIndex>();

    for (let col = 0; col < BOARD_COLS; col++) {
        const idx = getCellIndex(homeRow, col);
        if (cells[idx].length === 0) continue;

        const topCard = cells[idx][cells[idx].length - 1];
        if (isCardOwnedByPlayer(topCard, isRedPlayer)) {
            connected.add(idx);
            queue.push(idx);
            visited.add(idx);
        }
    }

    return { connected, queue, visited };
}

/**
 * Processes an adjacent cell during BFS traversal
 */
export function processAdjacentCell(
    adjIdx: CellIndex,
    cells: Cards[],
    isRedPlayer: boolean,
    connected: Set<CellIndex>,
    queue: CellIndex[],
    visited: Set<CellIndex>
): void {
    if (visited.has(adjIdx)) return;
    if (isDeckCell(adjIdx) || isHandCell(adjIdx)) return;
    if (cells[adjIdx].length === 0) return;

    const topCard = cells[adjIdx][cells[adjIdx].length - 1];
    if (isCardOwnedByPlayer(topCard, isRedPlayer)) {
        connected.add(adjIdx);
        queue.push(adjIdx);
    }
    visited.add(adjIdx);
}

export function findConnectedCells(
    cells: Cards[],
    homeRow: number,
    isRedPlayer: boolean
): Set<CellIndex> {
    const { connected, queue, visited } = getInitialConnectedCells(cells, homeRow, isRedPlayer);

    // BFS to find all connected cells
    while (queue.length > 0) {
        const current = queue.shift()!;
        const adjacentCells = getAdjacentCells(current);

        for (const adjIdx of adjacentCells) {
            processAdjacentCell(adjIdx, cells, isRedPlayer, connected, queue, visited);
        }
    }

    return connected;
}

/**
 * Update the game state after the first move
 * @param state Current game state
 * @param compareResult The result of comparing red and black cards
 */
export function updateStateAfterFirstMove(
    state: GameState,
    compareResult: RankComparisonResult
): void {
    state.comparisonResult = compareResult;
    state.isFirstRedMove = false;
    state.redHomeRow = Math.floor(state.redHomeCenter / BOARD_COLS);
    state.blackHomeRow = Math.floor(state.blackHomeCenter / BOARD_COLS);

    switch (compareResult) {
        case 'tie':
            state.isTiebreaker = true;
            state.currentPlayer = undefined;
            break;
        case 'red-wins':
            state.isTiebreaker = false;
            state.currentPlayer = 'red';
            break;
        case 'black-wins':
            state.isTiebreaker = false;
            state.currentPlayer = 'black';
            break;
    }
}

/**
 * Makes a move for the black player during tiebreaker
 * @param cells Current cells state
 * @param blackHomeCenter Black home center index
 * @param addFlight Function to add flight animation
 */
export function makeBlackTiebreakerMove(
    cells: Cards[],
    blackHomeCenter: CellIndex,
    addFlight: (src: CellIndex, dst: CellIndex) => void
): void {
    // Find a black hand cell with a card
    const blackHand = BLK_DST.find(idx => cells[idx].length > 0);
    if (blackHand !== undefined) {
        // Create a minimal game state for getTiebreakerDestinationsForCell
        const state: GameState = {
            cells,
            redHand: new Set(),
            redHomeCenter: 0 as CellIndex, // Not used for black player
            blackHomeCenter,
            isTiebreaker: true,
            isFirstRedMove: false // Not relevant for black player's move
        };

        // Get valid destinations for black player during tiebreaker
        const validDestinations = getTiebreakerDestinationsForCell(blackHand, state);
        const destinations = Array.from(validDestinations);
        if (destinations.length > 0) {
            const randomDest = destinations[Math.floor(Math.random() * destinations.length)] as CellIndex;
            addFlight(blackHand, randomDest);
        }
    }
}

/**
 * Handle the rank comparison after the first move and deal cards accordingly
 * @param cells The current game cells
 * @param redHomeCenter The red player's home center index
 * @param blackHomeCenter The black player's home center index
 * @param addFlight Function to add a flight animation
 * @param gameState Optional game state to update
 */
export function handleRankComparison(
    cells: Cards[],
    redHomeCenter: CellIndex,
    blackHomeCenter: CellIndex,
    addFlight: (src: CellIndex, dst: CellIndex) => void,
    gameState?: GameState
): void {
    const redCard = cells[redHomeCenter][cells[redHomeCenter].length - 1];
    const blackCard = cells[blackHomeCenter][cells[blackHomeCenter].length - 1];

    if (!redCard || !blackCard) return;

    const result = compareCardRanks(redCard, blackCard);

    // Update game state if provided
    if (gameState) {
        updateStateAfterFirstMove(gameState, result);
    }

    switch (result) {
        case 'tie': {
            // Both players get a card
            const emptyRedHand = findEmptyHandPosition(RED_DST, cells);
            const emptyBlackHand = findEmptyHandPosition(BLK_DST, cells);

            if (emptyRedHand) {
                setTimeout(() => addFlight(RED_SRC, emptyRedHand), DEAL_DELAY_MS);
            }

            if (emptyBlackHand) {
                setTimeout(() => {
                    addFlight(BLK_SRC, emptyBlackHand);
                    // After dealing black's card, trigger black's move
                    setTimeout(() => {
                        makeBlackTiebreakerMove(cells, blackHomeCenter, addFlight);
                    }, DEAL_DELAY_MS);
                }, DEAL_DELAY_MS);
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

export function finishPlayerTurn(gameState: GameState): void {
    if (!gameState.currentPlayer) {
        return;
    }

    // Case 1: Tiebreaker, current player is black. End tiebreaker and set next player.
    if (gameState.isTiebreaker && gameState.currentPlayer === 'black') {
        gameState.isTiebreaker = false;
        gameState.currentPlayer = gameState.comparisonResult === 'red-wins' ? 'red' : 'black';
        return;
    }

    // Case 2: Tiebreaker, current player is red. Switch to black for their tiebreaker move.
    if (gameState.isTiebreaker && gameState.currentPlayer === 'red') {
        gameState.currentPlayer = 'black';
        return;
    }

    // Case 3: Not a tiebreaker. Normal turn switching.
    // This block is reached if gameState.isTiebreaker is false from the start,
    // or if the tiebreaker conditions above were not met (which implies it wasn't a situation to handle for tiebreaker turn completion).
    if (!gameState.isTiebreaker) {
        gameState.currentPlayer = gameState.currentPlayer === 'red' ? 'black' : 'red';
    }
}

/**
 * Get valid destinations for a move, excluding hand cells from highlighting
 * @param from Source cell index
 * @param state Current game state
 * @returns Set of valid destination cell indices (excluding hand cells)
 */
export function getValidDestinationsWithoutHand(
    from: CellIndex,
    state: GameState
): Set<CellIndex> {
    const validDestinations = defaultGameRules.getValidDestinations(from, state);
    const filteredDestinations = Array.from(validDestinations).filter(dest => !isHandCell(dest));
    return new Set<CellIndex>(filteredDestinations);
}

export interface GameInteractionArgs {
    // Common args
    idx: CellIndex;
    gameState: GameState;
    cells: Cards[];
    setHighlightCells: (cells: Set<CellIndex>) => void;
    RED_HOME_CENTER: CellIndex;
    BLK_HOME_CENTER: CellIndex;
    // Down-specific args
    e?: React.PointerEvent<HTMLElement>;
    firstRedMove?: boolean;
    redHand?: Set<CellIndex>;
    BLK_DST?: CellIndex[];
    startDrag?: (idx: CellIndex) => void;
    drag?: { down: (e: React.PointerEvent<HTMLElement>, idx: CellIndex) => void };
    // Click-specific args
    firstRedMoveRef?: React.RefObject<boolean>;
    boardReveal?: (indices: CellIndex[]) => void;
    addFlight?: (src: CellIndex, dst: CellIndex) => void;
}

export function handleGameInteraction(args: GameInteractionArgs): void {
    const {
        idx,
        gameState,
        cells,
        setHighlightCells,
        RED_HOME_CENTER,
        BLK_HOME_CENTER,
        e,
        firstRedMove,
        redHand,
        BLK_DST,
        startDrag,
        drag,
        firstRedMoveRef,
        boardReveal,
        addFlight
    } = args;

    // Handle click interaction (first move completion)
    if (firstRedMoveRef?.current && idx === RED_HOME_CENTER) {
        boardReveal?.([RED_HOME_CENTER, BLK_HOME_CENTER]);
        firstRedMoveRef.current = false;
        setHighlightCells(new Set());

        gameState.cells = cells;
        gameState.isFirstRedMove = false;

        handleRankComparison(
            cells,
            RED_HOME_CENTER,
            BLK_HOME_CENTER,
            addFlight!,
            gameState
        );
        return;
    }

    // Handle down interaction
    if (e && startDrag && drag && firstRedMove !== undefined && redHand && BLK_DST) {
        // Guard: Early return if trying to interact with red home center after first move
        if (!firstRedMove && idx === RED_HOME_CENTER) {
            return;
        }

        // Case 1: First Red Move
        if (firstRedMove) {
            if (redHand.has(idx) || idx === RED_HOME_CENTER) {
                const allowedMoves = getAllowedMoves(
                    idx,
                    redHand,
                    true,
                    RED_HOME_CENTER,
                    cells
                );
                setHighlightCells(allowedMoves);
                startDrag(idx);
                drag.down(e, idx);
            }
            return;
        }

        // Case 2: Tiebreaker
        if (gameState.isTiebreaker) {
            const isRedHand = redHand.has(idx);
            const isBlackHand = BLK_DST.includes(idx);
            if (isRedHand || isBlackHand) {
                const validDestinations = getValidDestinationsWithoutHand(idx, gameState);
                setHighlightCells(validDestinations);
                startDrag(idx);
                drag.down(e, idx);
            }
            return;
        }

        // Case 3: Normal Player Turn
        const isRedPlayerTurn = gameState.currentPlayer === 'red';
        const isPlayerHand = isRedPlayerTurn ? redHand.has(idx) : BLK_DST.includes(idx);
        if (isPlayerHand) {
            const validDestinations = getValidDestinationsWithoutHand(idx, gameState);
            setHighlightCells(validDestinations);
            startDrag(idx);
            drag.down(e, idx);
        }
    }
}
