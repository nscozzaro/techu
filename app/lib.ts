'use client';

import { useRef } from 'react';

/* ──────────────────────────
   ▍Board constants & types
   ────────────────────────── */
export type BoardDimension = number & { __brand: 'BoardDimension' };
export const BOARD_ROWS = 7 as BoardDimension;
export const BOARD_COLS = 5 as BoardDimension;

export type PixelPosition = number & { __brand: 'PixelPosition' };
export type CellIndex = number & { __brand: 'CellIndex' };

export type Origin = {
    x: PixelPosition;
    y: PixelPosition;
    cell: CellIndex;
    offX: PixelPosition;
    offY: PixelPosition;
};

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
export type Suit = typeof SUITS[keyof typeof SUITS];

export const RANKS = {
    Two: 'Two', Three: 'Three', Four: 'Four', Five: 'Five',
    Six: 'Six', Seven: 'Seven', Eight: 'Eight', Nine: 'Nine',
    Ten: 'Ten', Jack: 'Jack', Queen: 'Queen', King: 'King', Ace: 'Ace',
} as const;
export type Rank = typeof RANKS[keyof typeof RANKS];

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
   ▍Drag‑and‑drop helpers
   ────────────────────────── */
const SNAP_MS = 250;
type DropFn = (from: CellIndex, to: CellIndex) => void;
type StyleKV = Partial<CSSStyleDeclaration>;

export const setPos = (el: HTMLElement | null, o: Origin | null, e: PointerEvent) => {
    if (!el || !o) return;
    Object.assign(el.style, { left: `${e.clientX - o.offX}px`, top: `${e.clientY - o.offY}px` });
};

export const clearStyles = (el: HTMLElement) =>
    Object.assign(el.style, {
        position: '', left: '', top: '', zIndex: '',
        width: '', height: '', transition: '', pointerEvents: '',
    });

export const snapBack = (el: HTMLElement, o: Origin) => {
    Object.assign(el.style, {
        transition: `left ${SNAP_MS}ms ease, top ${SNAP_MS}ms ease`,
        left: `${o.x}px`,
        top: `${o.y}px`,
    });
    el.addEventListener('transitionend', () => clearStyles(el), { once: true });
};

export const cellUnder = (e: PointerEvent) =>
    document.elementFromPoint(e.clientX, e.clientY)
        ?.closest('[data-cell]')?.getAttribute('data-cell');

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

/* ──────────────────────────
   ▍useSnapDrag hook
   ────────────────────────── */
export function useSnapDrag(onDrop: DropFn) {
    const elRef = useRef<HTMLElement | null>(null);
    const origin = useRef<Origin | null>(null);
    const mover = useRef<((e: PointerEvent) => void) | null>(null);

    const active = () => elRef.current && origin.current;
    const resetRefs = () => { elRef.current = null; origin.current = null; };
    const removeListen = () => {
        if (mover.current) document.removeEventListener('pointermove', mover.current);
        document.removeEventListener('pointerup', up);
        mover.current = null;
    };
    const dstCell = (e: PointerEvent) =>
        (Number(cellUnder(e) ?? origin.current!.cell)) as CellIndex;

    const up = (e: PointerEvent) => {
        if (!active()) return;
        const el = elRef.current!, o = origin.current!, dst = dstCell(e);
        if (dst === o.cell) {
            snapBack(el, o);
        } else {
            clearStyles(el);
            onDrop(o.cell, dst);
        }
        removeListen(); resetRefs();
    };

    const down = (e: React.PointerEvent<HTMLElement>, idx: CellIndex) => {
        const el = e.currentTarget, box = el.getBoundingClientRect();
        origin.current = calcOrigin(e, box, idx); elRef.current = el;
        Object.assign(el.style, fixedDragStyle(box));
        mover.current = evt => setPos(elRef.current, origin.current, evt);
        document.addEventListener('pointermove', mover.current);
        document.addEventListener('pointerup', up);
    };

    return { down };
}
