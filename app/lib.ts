'use client';

import { useRef } from 'react';

/* ────────────  CONSTANTS  ──────────── */
export type BoardDimension = number & { __brand: 'BoardDimension' };
export const BOARD_ROWS = 7 as BoardDimension;
export const BOARD_COLS = 5 as BoardDimension;

/* ────────────  TYPES  ──────────── */
export type PixelPosition = number & { __brand: 'PixelPosition' };
export type CellIndex = number & { __brand: 'CellIndex' };
export type Origin = {
    x: PixelPosition;
    y: PixelPosition;
    cell: CellIndex;
    offX: PixelPosition;
    offY: PixelPosition;
};

/* ────────────  CARDS  ──────────── */
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
type DropFn = (from: CellIndex, to: CellIndex) => void;
type StyleKV = Partial<CSSStyleDeclaration>;

// Moved helpers outside the hook for testing
export const setPos = (el: HTMLElement | null, origin: Origin | null, e: PointerEvent) => {
    if (!el || !origin) return;
    const { offX, offY } = origin;
    Object.assign(el.style, {
        left: `${e.clientX - offX}px`,
        top: `${e.clientY - offY}px`,
    });
};

export const clearStyles = (el: HTMLElement) =>
    Object.assign(el.style, {
        position: '', left: '', top: '', zIndex: '',
        width: '', height: '', transition: '', pointerEvents: '',
    });

export const snapBack = (el: HTMLElement, origin: Origin, SNAP_MS: number) => {
    const { x, y } = origin;
    el.style.transition = `left ${SNAP_MS}ms ease, top ${SNAP_MS}ms ease`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
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

export function useSnapDrag(onDrop: DropFn) {
    const elRef = useRef<HTMLElement | null>(null);
    const origin = useRef<Origin | null>(null);
    const moveListenerRef = useRef<((e: PointerEvent) => void) | null>(null);
    const SNAP_MS = 250;

    const isDragActive = () => elRef.current !== null && origin.current !== null;

    const handleUp = (e: PointerEvent) => {
        if (!isDragActive()) return;
        const el = elRef.current!;
        const currentOrigin = origin.current!;
        const dst = cellUnder(e) ? +(cellUnder(e)!) as CellIndex : currentOrigin.cell;

        if (dst === currentOrigin.cell) {
            snapBack(el, currentOrigin, SNAP_MS);
        } else {
            onDrop(currentOrigin.cell, dst);
            clearStyles(el);
        }

        if (moveListenerRef.current) {
            document.removeEventListener('pointermove', moveListenerRef.current);
        }
        document.removeEventListener('pointerup', handleUp);
        elRef.current = null;
        origin.current = null;
        moveListenerRef.current = null;
    };

    const down = (e: React.PointerEvent<HTMLElement>, cell: CellIndex) => {
        const el = e.currentTarget;
        const box = el.getBoundingClientRect();

        origin.current = calcOrigin(e, box, cell as CellIndex);
        elRef.current = el;

        Object.assign(el.style, fixedDragStyle(box));

        const moveListener = (e: PointerEvent) => setPos(elRef.current, origin.current, e);
        moveListenerRef.current = moveListener;
        document.addEventListener('pointermove', moveListener);
        document.addEventListener('pointerup', handleUp);
    };

    return { down };
}

