'use client';

import React, {
    forwardRef,
    useRef,
    useEffect,
    useState,
    useCallback,
    useReducer,
    PointerEvent as Ptr,
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

export const RED_SRC = ((BOARD_ROWS - 1) * BOARD_COLS) as CellIndex; // 30
export const RED_DST = [31, 32, 33] as CellIndex[];
export const BLK_SRC = (BOARD_COLS - 1) as CellIndex;               // 4
export const BLK_DST = [3, 2, 1] as CellIndex[];
export const DEAL_DELAY_MS = 1_000;

/* export handy list of the two deck cells */
export const DECK_CELLS = [RED_SRC, BLK_SRC] as const;

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

export interface Card { suit: Suit; rank: Rank; faceUp: boolean }
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
   Board reducer
   ────────────────────────── */
export interface BoardState {
    cells: Cards[];
    dragSrc: CellIndex | null;
}
export type BoardAction =
    | { type: 'MOVE'; from: CellIndex; to: CellIndex }
    | { type: 'SWAP'; a: CellIndex; b: CellIndex }
    | { type: 'START_DRAG'; src: CellIndex }
    | { type: 'END_DRAG' };

/* Helpers */
const moveCardInCells = (cells: Cards[], from: CellIndex, to: CellIndex) => {
    if (from === to) return cells;
    const next = cells.map(s => [...s]) as Cards[];
    const card = next[from].pop();
    if (card) {
        const dstRow = Math.floor(to / BOARD_COLS);
        const keepFaceDown = from === BLK_SRC && dstRow === 0;
        if (!keepFaceDown) card.faceUp = true;
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

export const fixedDragStyle = (box: DOMRect): StyleKV => ({
    position: 'fixed',
    left: `${box.left}px`, top: `${box.top}px`,
    width: `${box.width}px`, height: `${box.height}px`,
    zIndex: '10', transition: 'none', pointerEvents: 'none',
});

const dragPos = (o: Origin, e: PointerEvent): StyleKV => ({
    left: `${e.clientX - o.offX}px`,
    top: `${e.clientY - o.offY}px`,
});
export const setPos = (
    el: HTMLElement | null,
    o: Origin | null,
    e: PointerEvent,
) => el && o && setStyle(el, dragPos(o, e));

const snapBackStyle = (o: Origin, ms: number): StyleKV => ({
    left: `${o.x}px`, top: `${o.y}px`,
    transition: `left ${ms}ms ease, top ${ms}ms ease`,
});
export const snapBack = (el: HTMLElement, o: Origin, ms = 250) => {
    setStyle(el, snapBackStyle(o, ms));
    el.addEventListener('transitionend', () => clearStyles(el), { once: true });
};

/* ──────────────────────────
   Hook: useSnapDrag
   ────────────────────────── */
type DropFn = (from: CellIndex, to: CellIndex) => void;
const SNAP_MS = 250;

export function useSnapDrag(
    onDrop: DropFn,
    canDrop?: (from: CellIndex, to: CellIndex) => boolean,
) {
    const elRef = useRef<HTMLElement | null>(null);
    const origRef = useRef<Origin | null>(null);
    const moveRef = useRef<((e: PointerEvent) => void) | null>(null);

    const isActive = () => elRef.current && origRef.current;

    const destCell = (e: PointerEvent): CellIndex =>
    (Number(
        document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest('[data-cell]')
            ?.getAttribute('data-cell') ?? origRef.current!.cell,
    ) as CellIndex);

    const pointerUp = (e: PointerEvent) => {
        if (!isActive()) return;
        const el = elRef.current!;
        const o = origRef.current!;
        const dst = destCell(e);
        const allowed = canDrop ? canDrop(o.cell, dst) : true;

        if (!allowed || dst === o.cell) {
            snapBack(el, o, SNAP_MS);
        } else {
            clearStyles(el);
            onDrop(o.cell, dst);
        }

        if (moveRef.current)
            document.removeEventListener('pointermove', moveRef.current);
        document.removeEventListener('pointerup', pointerUp);
        moveRef.current = null;
        elRef.current = origRef.current = null;
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
        setStyle(el, fixedDragStyle(box));

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
    id: string; src: CellIndex; dst: CellIndex;
    start: DOMRect; end: DOMRect;
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

const noop: (e: Ptr<HTMLElement>) => void = () => { };

export const Cell = forwardRef<HTMLDivElement, {
    idx: CellIndex;
    stack: Cards;
    hidden: number;
    dragSrc: CellIndex | null;
    isDragging: boolean;
    onDown: (e: Ptr<HTMLElement>, idx: CellIndex) => void;
}>((p, ref) => {
    const { idx, stack, hidden, dragSrc, isDragging, onDown } = p;
    const top = stack[stack.length - 1 - hidden];
    const next = stack[stack.length - 2 - hidden];

    /* determine interactivity rules */
    const isDeck = idx === RED_SRC || idx === BLK_SRC;
    const isBlackTop = top && cardColor(top.suit) === 'black';
    const inactive = isDeck || isBlackTop;

    /* style / handler based on interactivity */
    const cellStyle = inactive ? { pointerEvents: 'none' as const } : undefined;
    const down = inactive ? noop : (e: Ptr<HTMLElement>) => onDown(e, idx);

    return (
        <div
            ref={ref}
            data-cell={idx}
            className={styles.cell}
            role="generic"
            style={cellStyle}
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
    /* 1. place card at start coords */
    const [style, setStyle] = useState<React.CSSProperties>(() => ({
        position: 'fixed',
        left: flight.start.left,
        top: flight.start.top,
        width: flight.start.width,
        height: flight.start.height,
        transition: 'left 250ms ease, top 250ms ease',
    }));

    /* 2. schedule the move on the next frame */
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

    /* 3. fire onFinish **once** */
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
   ▍ Logic hooks exported here
   ────────────────────────── */
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
    };
}

export function useFlights(
    refs: React.RefObject<(HTMLDivElement | null)[]>,
    moveCard: (from: CellIndex, to: CellIndex) => void,
) {
    const [flights, dispatch] = useReducer(flightsReducer, [] as Flights);

    const hiddenByCell = useCallback(
        (idx: number) => flights.filter(f => f.src === idx).length,
        [flights],
    );

    const addFlight = useCallback(
        (src: CellIndex, dst: CellIndex) => {
            const fromEl = refs.current[src];
            const toEl = refs.current[dst];
            if (!fromEl || !toEl) return;

            dispatch({
                type: 'ADD',
                payload: {
                    id: Math.random().toString(36).slice(2),
                    src, dst,
                    start: fromEl.getBoundingClientRect(),
                    end: toEl.getBoundingClientRect(),
                },
            });
        },
        [refs],
    );

    const completeFlight = useCallback(
        (f: Flight) => {
            moveCard(f.src, f.dst);
            dispatch({ type: 'REMOVE', id: f.id });
        },
        [moveCard],
    );

    return { flights, hiddenByCell, addFlight, completeFlight };
}
