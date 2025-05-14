// components/useSnapDrag.ts
'use client';

import { useRef } from 'react';

type DropFn = (from: number, to: number) => void;

export function useSnapDrag(onDrop: DropFn) {

    const elRef = useRef<HTMLElement | null>(null);
    const origin = useRef<{
        x: number; y: number; cell: number; offX: number; offY: number;
    } | null>(null);

    const SNAP_MS = 250;

    const move = (e: PointerEvent | React.PointerEvent) =>
        elRef.current &&
        Object.assign(elRef.current.style, {
            left: `${e.clientX - origin.current!.offX}px`,
            top: `${e.clientY - origin.current!.offY}px`,
        });

    const finishStyles = {
        position: '', left: '', top: '', zIndex: '',
        width: '', height: '', transition: '', pointerEvents: '',
    };

    const up = (e: PointerEvent | React.PointerEvent) => {
        if (!elRef.current || !origin.current) return;

        const el = elRef.current;
        const dest = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-cell]');
        const dst = dest ? +dest.getAttribute('data-cell')! : origin.current.cell;

        const finish = () => Object.assign(el.style, finishStyles);

        if (dst === origin.current.cell) {
            Object.assign(el.style, {
                transition: `left ${SNAP_MS}ms ease, top ${SNAP_MS}ms ease`,
                left: `${origin.current.x}px`,
                top: `${origin.current.y}px`,
            });
            el.addEventListener('transitionend', () => { finish(); elRef.current = null; }, { once: true });
        } else {
            finish();
            onDrop(origin.current.cell, dst);
            elRef.current = null;
        }

        origin.current = null;
        document.removeEventListener('pointermove', moveDoc);
        document.removeEventListener('pointerup', upDoc);
    };

    /* wrappers with browser‑friendly signatures */
    const moveDoc = (e: PointerEvent) => move(e);
    const upDoc = (e: PointerEvent) => up(e);

    const down = (e: React.PointerEvent<HTMLElement>, idx: number) => {
        const el = e.currentTarget;
        const { left, top, width, height } = el.getBoundingClientRect();
        origin.current = {
            x: left, y: top, cell: idx,
            offX: e.clientX - left, offY: e.clientY - top
        };
        elRef.current = el;

        Object.assign(el.style, {
            position: 'fixed',
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
            zIndex: 10,
            transition: 'none',
            pointerEvents: 'none',
        });

        document.addEventListener('pointermove', moveDoc);
        document.addEventListener('pointerup', upDoc);
    };

    return { down };
}
