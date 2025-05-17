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
   Constants & Branded Types
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
   Card Domain
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

export const SUIT_COLOR: Record<Suit, 'black' | 'red'> = {
    [SUITS.Clubs]: 'black',
    [SUITS.Spades]: 'black',
    [SUITS.Hearts]: 'red',
    [SUITS.Diamonds]: 'red',
};
export const cardColor = (suit: Suit) => SUIT_COLOR[suit];

/* starting decks – all face‑down */
export function makeStartingCells(): Cards[] {
    const cells = Array.from({ length: BOARD_ROWS * BOARD_COLS }, () => [] as Cards);

    const push = (cell: CellIndex, suit: Suit, rank: Rank) =>
        cells[cell].push({ suit, rank, faceUp: false });

    Object.values(RANKS).forEach(rank => {
        [SUITS.Hearts, SUITS.Diamonds].forEach(suit => push(RED_SRC, suit, rank));
        [SUITS.Clubs, SUITS.Spades].forEach(suit => push(BLK_SRC, suit, rank));
    });

    return cells;
}

/* ──────────────────────────
   Board Reducer
   ────────────────────────── */
export interface BoardState {
    cells: Cards[];
    dragSrc: CellIndex | null;
}

export type BoardAction =
    | { type: 'MOVE'; from: CellIndex; to: CellIndex }
    | { type: 'START_DRAG'; src: CellIndex }
    | { type: 'END_DRAG' };

const moveCardInCells = (cells: Cards[], from: CellIndex, to: CellIndex) => {
    if (from === to) return cells;

    const next = cells.map(stack => [...stack]) as Cards[];
    const card = next[from].pop();
    if (card) {
        card.faceUp = true;
        next[to].push(card);
    }
    return next;
};

export const reducer: Reducer<BoardState, BoardAction> = (state, action) => {
    switch (action.type) {
        case 'MOVE':
            return {
                cells: moveCardInCells(state.cells, action.from, action.to),
                dragSrc: null,
            };
        case 'START_DRAG':
            return { ...state, dragSrc: action.src };
        case 'END_DRAG':
            return { ...state, dragSrc: null };
    }
};

/* ──────────────────────────
   DOM Style Helpers
   ────────────────────────── */
type StyleKV = Partial<CSSStyleDeclaration>;
const setStyle = (el: HTMLElement, kv: StyleKV) => Object.assign(el.style, kv);

const ORIGIN_CLEAR: StyleKV = {
    position: '', left: '', top: '', zIndex: '',
    width: '', height: '', transition: '', pointerEvents: '',
};

export interface Origin {
    x: PixelPosition;
    y: PixelPosition;
    cell: CellIndex;
    offX: PixelPosition;
    offY: PixelPosition;
}

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

const dragPosition = (o: Origin, e: PointerEvent): StyleKV => ({
    left: `${e.clientX - o.offX}px`,
    top: `${e.clientY - o.offY}px`,
});

const snapBackStyle = (o: Origin, ms: number): StyleKV => ({
    left: `${o.x}px`,
    top: `${o.y}px`,
    transition: `left ${ms}ms ease, top ${ms}ms ease`,
});

export const setPos = (el: HTMLElement | null, o: Origin | null, e: PointerEvent) =>
    el && o && setStyle(el, dragPosition(o, e));

export const clearStyles = (el: HTMLElement) => setStyle(el, ORIGIN_CLEAR);

export const snapBack = (el: HTMLElement, o: Origin, ms = 250) => {
    setStyle(el, snapBackStyle(o, ms));
    el.addEventListener('transitionend', () => clearStyles(el), { once: true });
};

/* ──────────────────────────
   useSnapDrag
   ────────────────────────── */
type DropFn = (from: CellIndex, to: CellIndex) => void;
const SNAP_MS = 250;

export function useSnapDrag(onDrop: DropFn) {
    const elementRef = useRef<HTMLElement | null>(null);
    const originRef = useRef<Origin | null>(null);
    const moveHandlerRef = useRef<((e: PointerEvent) => void) | null>(null);

    const isActive = () => elementRef.current && originRef.current;

    const destinationCell = (evt: PointerEvent): CellIndex =>
    (Number(
        document.elementFromPoint(evt.clientX, evt.clientY)
            ?.closest('[data-cell]')?.getAttribute('data-cell') ?? originRef.current!.cell,
    ) as CellIndex);

    const pointerUp = (evt: PointerEvent) => {
        if (!isActive()) return;
        const el = elementRef.current!;
        const origin = originRef.current!;
        const dst = destinationCell(evt);

        if (dst === origin.cell) {
            snapBack(el, origin, SNAP_MS);
        } else {
            onDrop(origin.cell, dst);
        }

        if (moveHandlerRef.current)
            document.removeEventListener('pointermove', moveHandlerRef.current);
        document.removeEventListener('pointerup', pointerUp);

        moveHandlerRef.current = null;
        elementRef.current = originRef.current = null;
    };

    const down = (evt: React.PointerEvent<HTMLElement>, idx: CellIndex) => {
        const el = evt.currentTarget;
        const box = el.getBoundingClientRect();

        originRef.current = {
            x: box.left as PixelPosition,
            y: box.top as PixelPosition,
            cell: idx,
            offX: (evt.clientX - box.left) as PixelPosition,
            offY: (evt.clientY - box.top) as PixelPosition,
        };
        elementRef.current = el;

        setStyle(el, fixedDragStyle(box));

        moveHandlerRef.current = e => setPos(elementRef.current, originRef.current, e);
        document.addEventListener('pointermove', moveHandlerRef.current);
        document.addEventListener('pointerup', pointerUp);
    };

    return { down };
}

/* ──────────────────────────
   Flights
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

export const flightsReducer = (list: Flights, action: FlightAction): Flights =>
    action.type === 'ADD' ? [...list, action.payload] : list.filter(f => f.id !== action.id);

/* ──────────────────────────
   Presentational Components
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

export const Cell = forwardRef<HTMLDivElement, CellProps>((props, ref) => {
    const { idx, stack, hidden, dragSrc, isDragging, onDown } = props;
    const top = stack[stack.length - 1 - hidden];
    const second = stack[stack.length - 2 - hidden];

    return (
        <div ref={ref} data-cell={idx} className={styles.cell} role="generic">
            {top && <CardView card={top} onDown={e => onDown(e, idx)} />}
            {second && isDragging && dragSrc === idx && (
                <CardView card={second} onDown={e => onDown(e, idx)} />
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
            setStyle(prev => ({ ...prev, left: flight.end.left, top: flight.end.top })),
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
