// components/useSnapDrag.ts
'use client';

import { useRef } from 'react';

type DropFn = (from: number, to: number) => void;

export function useSnapDrag(onDrop: DropFn) {
    type Origin = { x: number; y: number; cell: number; offX: number; offY: number };

    const elRef = useRef<HTMLElement | null>(null);
    const origin = useRef<Origin | null>(null);
    const SNAP_MS = 250;

    /* ---------- helpers ---------- */

    const move = (e: PointerEvent | React.PointerEvent) => {
        if (!elRef.current || !origin.current) return;
        elRef.current.style.left = `${e.clientX - origin.current.offX}px`;
        elRef.current.style.top = `${e.clientY - origin.current.offY}px`;
    };

    const resetStyles = {
        position: '', left: '', top: '', zIndex: '', transition: '', pointerEvents: '',
    };

    const up = (e: PointerEvent | React.PointerEvent) => {
        if (!elRef.current || !origin.current) return;
        const el = elRef.current;
        const orig = origin.current;

        const destEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-cell]');
        const destIdx = destEl ? +destEl.getAttribute('data-cell')! : orig.cell;

        const finish = () => Object.assign(el.style, resetStyles);

        if (destIdx === orig.cell) {
            Object.assign(el.style, {
                transition: `left ${SNAP_MS}ms ease, top ${SNAP_MS}ms ease`,
                left: `${orig.x}px`,
                top: `${orig.y}px`,
            });
            el.addEventListener(
                'transitionend',
                () => { finish(); elRef.current = null; },
                { once: true },
            );
        } else {
            finish();
            onDrop(orig.cell, destIdx);
            elRef.current = null;
        }

        origin.current = null;
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up as any);
    };

    const down = (e: React.PointerEvent<HTMLElement>, idx: number) => {
        const el = e.currentTarget;
        const { left, top } = el.getBoundingClientRect();
        const offX = e.clientX - left;
        const offY = e.clientY - top;

        origin.current = { x: left, y: top, cell: idx, offX, offY };
        elRef.current = el as HTMLElement;

        Object.assign(el.style, {
            position: 'fixed',
            left: `${left}px`,
            top: `${top}px`,
            zIndex: 10,
            transition: 'none',
            pointerEvents: 'none',
        });

        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up as any);
    };

    return { down, move, up };
}
