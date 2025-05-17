'use client';

import React, {
    forwardRef,
    useRef,
    useEffect,
    useState,
    PointerEvent as Ptr,
} from 'react';
import type { Reducer } from 'react';
import styles from './page.module.css';

/* ──────────────────────────
 ▍Board constants & branded types
 ────────────────────────── */
export type BoardDimension = number & { __brand: 'BoardDimension' };
export const BOARD_ROWS = 7 as BoardDimension;
export const BOARD_COLS = 5 as BoardDimension;

export type CellIndex = number & { __brand: 'CellIndex' };
export type PixelPosition = number & { __brand: 'PixelPosition' };

export const RED_SRC = ((BOARD_ROWS - 1) * BOARD_COLS) as CellIndex; // 30
export const RED_DST = [31, 32, 33] as CellIndex[];
export const BLK_SRC = (BOARD_COLS - 1) as CellIndex;                // 4
export const BLK_DST = [3, 2, 1] as CellIndex[];
export const DEAL_DELAY_MS = 1_000;

/* ──────────────────────────
 ▍Cards & helpers
 ────────────────────────── */
export const SUITS = {
    Clubs: 'Clubs',
    Diamonds: 'Diamonds',
    Hearts: 'Hearts',
    Spades: 'Spades',
} as const;
export type Suit = (typeof SUITS)[keyof typeof SUITS];

export const RANKS = {
    Two: 'Two', Three: 'Three', Four: 'Four', Five: 'Five',
    Six: 'Six', Seven: 'Seven', Eight: 'Eight', Nine: 'Nine',
    Ten: 'Ten', Jack: 'Jack', Queen: 'Queen', King: 'King', Ace: 'Ace',
} as const;
export type Rank = (typeof RANKS)[keyof typeof RANKS];

export interface Card { suit: Suit; rank: Rank; faceUp: boolean }
export type Cards = Card[];

export const SUIT_COLORS = {
    [SUITS.Clubs]: 'black',
    [SUITS.Spades]: 'black',
    [SUITS.Hearts]: 'red',
    [SUITS.Diamonds]: 'red',
} as const;
export const cardColor = (suit: Suit) => SUIT_COLORS[suit];

/* decks in two source cells (all face‑down) */
export function makeStartingCells(): Cards[] {
    const cells = Array.from({ length: BOARD_ROWS * BOARD_COLS }, () => [] as Cards);
    const push = (cell: CellIndex, suit: keyof typeof SUITS, rank: keyof typeof RANKS) =>
        cells[cell].push({ suit: SUITS[suit], rank: RANKS[rank], faceUp: false });

    Object.values(RANKS).forEach(r => {
        ([SUITS.Hearts, SUITS.Diamonds]).forEach(s => push(RED_SRC, s, r));
        ([SUITS.Clubs, SUITS.Spades]).forEach(s => push(BLK_SRC, s, r));
    });
    return cells;
}

/* ──────────────────────────
 ▍Board reducer
 ────────────────────────── */
export interface BoardState {
    cells: Cards[];
    dragSrc: CellIndex | null;
}

export type BoardAction =
    | { type: 'MOVE'; from: CellIndex; to: CellIndex }
    | { type: 'START_DRAG'; src: CellIndex }
    | { type: 'END_DRAG' };

export const reducer: Reducer<BoardState, BoardAction> = (state, action) => {
    switch (action.type) {
        case 'MOVE': {
            if (action.from === action.to) return { ...state, dragSrc: null };
            const next = state.cells.map(s => [...s]) as Cards[];
            const card = next[action.from].pop();
            if (card) {
                card.faceUp = true;
                next[action.to].push(card);
            }
            return { cells: next, dragSrc: null };
        }
        case 'START_DRAG':
            return { ...state, dragSrc: action.src };
        case 'END_DRAG':
            return { ...state, dragSrc: null };
    }
};

/* ──────────────────────────
 ▍DOM‑style helpers
 ────────────────────────── */
type StyleKV = Partial<CSSStyleDeclaration>;

const applyStyles = (el: HTMLElement, s: StyleKV): StyleKV => {
    Object.assign(el.style, s);
    return s;
};

const CLEAR: StyleKV = {
    position: '', left: '', top: '', zIndex: '',
    width: '', height: '', transition: '', pointerEvents: '',
};

const dragPos = (o: Origin, e: PointerEvent): StyleKV => ({
    left: `${e.clientX - o.offX}px`,
    top: `${e.clientY - o.offY}px`,
});

export const fixedDragStyle = (box: DOMRect): StyleKV => ({
    position: 'fixed',
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    zIndex: '10',
    transition: 'none',
    pointerEvents: 'none',
});

const snapBackStyle = (o: Origin, ms: number): StyleKV => ({
    left: `${o.x}px`,
    top: `${o.y}px`,
    transition: `left ${ms}ms ease, top ${ms}ms ease`,
});

export const setPos = (
    el: HTMLElement | null,
    o: Origin | null,
    e: PointerEvent,
): StyleKV => (!el || !o) ? {} : applyStyles(el, dragPos(o, e));

export const clearStyles = (el: HTMLElement): StyleKV => applyStyles(el, CLEAR);

export const snapBack = (el: HTMLElement, o: Origin, ms = 250): StyleKV => {
    applyStyles(el, snapBackStyle(o, ms));
    el.addEventListener('transitionend', () => clearStyles(el), { once: true });
    return el.style;
};

export const cellUnder = (e: PointerEvent): string | null =>
    document.elementFromPoint(e.clientX, e.clientY)
        ?.closest('[data-cell]')?.getAttribute('data-cell') ?? null;

export interface Origin {
    x: PixelPosition;
    y: PixelPosition;
    cell: CellIndex;
    offX: PixelPosition;
    offY: PixelPosition;
}

export const calcOrigin = (
    e: React.PointerEvent<HTMLElement>,
    box: DOMRect,
    cell: CellIndex,
): Origin => ({
    x: box.left as PixelPosition,
    y: box.top as PixelPosition,
    cell,
    offX: (e.clientX - box.left) as PixelPosition,
    offY: (e.clientY - box.top) as PixelPosition,
});

/* ──────────────────────────
 ▍useSnapDrag (hook)
 ────────────────────────── */
type DropFn = (from: CellIndex, to: CellIndex) => void;
const SNAP_MS = 250;

interface DragRefs {
    el: { current: HTMLElement | null };
    o: { current: Origin | null };
    move: { current: ((e: PointerEvent) => void) | null };
}

const isActive = (r: DragRefs) => !!r.el.current && !!r.o.current;
const chooseDst = (e: PointerEvent, cur: CellIndex) =>
    (Number(cellUnder(e) ?? cur) as CellIndex);

export function useSnapDrag(onDrop: DropFn) {
    const refs: DragRefs = {
        el: useRef<HTMLElement | null>(null),
        o: useRef<Origin | null>(null),
        move: useRef<((e: PointerEvent) => void) | null>(null),
    };

    const pointerUp = (evt: PointerEvent) => {
        if (!isActive(refs)) return;
        const el = refs.el.current!;
        const o = refs.o.current!;
        const dst = chooseDst(evt, o.cell);

        if (dst === o.cell) snapBack(el, o, SNAP_MS);
        else {
            clearStyles(el);
            onDrop(o.cell, dst);
        }

        if (refs.move.current)
            document.removeEventListener('pointermove', refs.move.current);
        document.removeEventListener('pointerup', pointerUp);
        refs.move.current = null;
        refs.el.current = refs.o.current = null;
    };

    const down = (evt: React.PointerEvent<HTMLElement>, idx: CellIndex) => {
        const el = evt.currentTarget;
        const box = el.getBoundingClientRect();
        refs.o.current = calcOrigin(evt, box, idx);
        refs.el.current = el;

        applyStyles(el, fixedDragStyle(box));

        refs.move.current = e => setPos(refs.el.current, refs.o.current, e);
        document.addEventListener('pointermove', refs.move.current);
        document.addEventListener('pointerup', pointerUp);
    };

    return { down };
}

/* ──────────────────────────
 ▍Flights
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

export function flightsReducer(list: Flights, action: FlightAction): Flights {
    return action.type === 'ADD'
        ? [...list, action.payload]
        : list.filter(f => f.id !== action.id);
}

/* ──────────────────────────
 ▍Presentational components
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
            <span>🂠</span>
        )}
    </div>
);

type CellProps = {
    idx: CellIndex;
    stack: Cards;
    hidden: number;
    dragSrc: CellIndex | null;
    isDragging: boolean;
    onDown: (e: Ptr<HTMLElement>, idx: CellIndex) => void;
};

export const Cell = forwardRef<HTMLDivElement, CellProps>((p, ref) => {
    const top = p.stack[p.stack.length - 1 - p.hidden];
    const second = p.stack[p.stack.length - 2 - p.hidden];
    return (
        <div
            ref={ref}
            data-cell={p.idx}
            className={styles.cell}
            role="generic"
        >
            {top && <CardView card={top} onDown={e => p.onDown(e, p.idx)} />}
            {second && p.isDragging && p.dragSrc === p.idx && (
                <CardView card={second} onDown={e => p.onDown(e, p.idx)} />
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
    }));

    useEffect(() => {
        const id = requestAnimationFrame(() =>
            setStyle(s => ({ ...s, left: flight.end.left, top: flight.end.top })),
        );
        return () => cancelAnimationFrame(id);
    }, [flight.end]);

    return (
        <div
            className={`${styles.card} ${styles.back} ${styles.flying}`}
            style={style}
            onTransitionEnd={onFinish}
            data-flight-id={flight.id}
        >
            <span>🂠</span>
        </div>
    );
}
