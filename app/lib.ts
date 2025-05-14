'use client';

import { useRef } from 'react';

/* ────────────  CONSTANTS  ──────────── */
export type BoardDimension = number & { __brand: 'BoardDimension' };
export const BOARD_ROWS = 7 as BoardDimension;
export const BOARD_COLS = 5 as BoardDimension;

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

/* ────────────  useSnapDrag  ──────────── */
type DropFn = (from: number, to: number) => void;
type Origin = { x: number; y: number; cell: number; offX: number; offY: number };
type StyleKV = Record<string, string>;

export function useSnapDrag(onDrop: DropFn) {
    const elRef = useRef<HTMLElement | null>(null);
    const origin = useRef<Origin | null>(null);
    const SNAP_MS = 250;

    /* ── helpers ── */
    const setPos = (e: PointerEvent) => {
        if (!elRef.current || !origin.current) return;
        const { offX, offY } = origin.current;
        Object.assign(elRef.current.style, {
            left: `${e.clientX - offX}px`,
            top: `${e.clientY - offY}px`,
        });
    };

    const clearStyles = (el: HTMLElement) =>
        Object.assign(el.style, {
            position: '', left: '', top: '', zIndex: '',
            width: '', height: '', transition: '', pointerEvents: '',
        });

    const snapBack = (el: HTMLElement) => {
        const { x, y } = origin.current!;
        el.style.transition = `left ${SNAP_MS}ms ease, top ${SNAP_MS}ms ease`;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.addEventListener('transitionend', () => clearStyles(el), { once: true });
    };

    const cellUnder = (e: PointerEvent) =>
        document.elementFromPoint(e.clientX, e.clientY)
            ?.closest('[data-cell]')?.getAttribute('data-cell');

    const cleanup = () => {
        document.removeEventListener('pointermove', setPos as EventListener);
        document.removeEventListener('pointerup', handleUp as EventListener);
        elRef.current = null;
        origin.current = null;
    };

    /* ── tiny pure helpers used by `down` ── */
    const calcOrigin = (
        e: React.PointerEvent<HTMLElement>,
        box: DOMRect, cell: number,
    ): Origin => ({
        x: box.left,
        y: box.top,
        cell,
        offX: e.clientX - box.left,
        offY: e.clientY - box.top,
    });

    const fixedDragStyle = (box: DOMRect): StyleKV => ({
        position: 'fixed',
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        zIndex: '10',
        transition: 'none',
        pointerEvents: 'none',
    });

    /* ── main handlers ── */
    const handleUp = (e: PointerEvent) => {
        if (!elRef.current || !origin.current) return;
        const el = elRef.current;
        const dst = cellUnder(e) ? +cellUnder(e)! : origin.current.cell;

        dst === origin.current.cell
            ? snapBack(el)
            : (onDrop(origin.current.cell, dst), clearStyles(el));

        cleanup();
    };

    /* ▍ down – now a simple orchestrator (11 lines) ▍ */
    const down = (e: React.PointerEvent<HTMLElement>, cell: number) => {
        const el = e.currentTarget;
        const box = el.getBoundingClientRect();

        origin.current = calcOrigin(e, box, cell);
        elRef.current = el;

        Object.assign(el.style, fixedDragStyle(box));

        document.addEventListener('pointermove', setPos as EventListener);
        document.addEventListener('pointerup', handleUp as EventListener);
    };

    return { down };
}
