'use client';

import { useRef } from 'react';

/* ──────────────────────────
 ▍Board constants & types
 ────────────────────────── */
export type BoardDimension = number & { __brand: 'BoardDimension' };
export const BOARD_ROWS = 7 as BoardDimension;
export const BOARD_COLS = 5 as BoardDimension;

export type PixelPosition = number & { __brand: 'PixelPosition' };
export type CellIndex = number & { __brand: 'CellIndex' };

export interface Origin {
    x: PixelPosition;
    y: PixelPosition;
    cell: CellIndex;
    offX: PixelPosition;
    offY: PixelPosition;
}

/* ──────────────────────────
 ▍Card domain
 ────────────────────────── */
export enum SuitEnum { Clubs, Diamonds, Hearts, Spades }

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

export interface Card { suit: Suit; rank: Rank }
export type Cards = Card[];

export const SUIT_COLORS = {
    [SUITS.Clubs]: 'black',
    [SUITS.Spades]: 'black',
    [SUITS.Hearts]: 'red',
    [SUITS.Diamonds]: 'red',
} as const;
export type PlayerColor = (typeof SUIT_COLORS)[Suit];
export const cardColor = (suit: Suit): PlayerColor => SUIT_COLORS[suit];

/* ──────────────────────────
 ▍DOM‑style helpers (pure)
 ────────────────────────── */
type StyleKV = Partial<CSSStyleDeclaration>;

const applyStyles = (el: HTMLElement, styles: StyleKV): StyleKV => {
    Object.assign(el.style, styles);
    return styles;
};

const CLEAR_STYLES: StyleKV = {
    position: '', left: '', top: '', zIndex: '',
    width: '', height: '', transition: '', pointerEvents: '',
};

const dragPos = (o: Origin, e: PointerEvent): StyleKV => ({
    left: `${e.clientX - o.offX}px`,
    top: `${e.clientY - o.offY}px`,
});

const fixedDragStyle = (box: DOMRect): StyleKV => ({
    position: 'fixed',
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    zIndex: '10',
    pointerEvents: 'none',
    transition: 'none',
});

const snapBackStyle = (o: Origin, ms: number): StyleKV => ({
    left: `${o.x}px`,
    top: `${o.y}px`,
    transition: `left ${ms}ms ease, top ${ms}ms ease`,
});

/* ───── wrappers (side‑effects + return) ───── */
export const setPos = (
    el: HTMLElement | null,
    o: Origin | null,
    e: PointerEvent,
): StyleKV => (!el || !o) ? {} : applyStyles(el, dragPos(o, e));

export const clearStyles = (el: HTMLElement): StyleKV =>
    applyStyles(el, CLEAR_STYLES);

export const snapBack = (
    el: HTMLElement,
    o: Origin,
    ms: number = 250,
): StyleKV => {
    const applied = applyStyles(el, snapBackStyle(o, ms));
    el.addEventListener('transitionend', () => clearStyles(el), { once: true });
    return applied;
};

export const cellUnder = (e: PointerEvent): string | null =>
    document.elementFromPoint(e.clientX, e.clientY)
        ?.closest('[data-cell]')?.getAttribute('data-cell') ?? null;

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

export { fixedDragStyle };   // for unit tests

/* ──────────────────────────
 ▍useSnapDrag – public hook
 ────────────────────────── */
type DropFn = (from: CellIndex, to: CellIndex) => void;
const SNAP_MS = 250;

interface DragRefs {
    el: React.MutableRefObject<HTMLElement | null>;
    o: React.MutableRefObject<Origin | null>;
    move: React.MutableRefObject<((e: PointerEvent) => void) | null>;
}

const isActive = (r: DragRefs): boolean => !!r.el.current && !!r.o.current;

const chooseDestination = (
    evt: PointerEvent,
    currentCell: CellIndex,
): CellIndex => (Number(cellUnder(evt) ?? currentCell) as CellIndex);

const removeGlobalListeners = (
    refs: DragRefs,
    upListener: (e: PointerEvent) => void,
): void => {
    if (refs.move.current)
        document.removeEventListener('pointermove', refs.move.current);
    document.removeEventListener('pointerup', upListener);
    refs.move.current = null;
};

export function useSnapDrag(onDrop: DropFn) {
    /* grouped refs make passing around state tidy */
    const refs: DragRefs = {
        el: useRef<HTMLElement | null>(null),
        o: useRef<Origin | null>(null),
        move: useRef<((e: PointerEvent) => void) | null>(null),
    };

    /* pointer‑up — now a simple, non‑recursive closure */
    const pointerUp = (evt: PointerEvent): void => {
        if (!isActive(refs)) return;

        const el = refs.el.current!;
        const o = refs.o.current!;
        const dest = chooseDestination(evt, o.cell);

        dest === o.cell
            ? snapBack(el, o, SNAP_MS)
            : (clearStyles(el), onDrop(o.cell, dest));

        removeGlobalListeners(refs, pointerUp);
        refs.el.current = refs.o.current = null;
    };

    /* pointer‑down wires everything together */
    const down = (evt: React.PointerEvent<HTMLElement>, idx: CellIndex): void => {
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
