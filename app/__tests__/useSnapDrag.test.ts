// app/__tests__/useSnapDrag.test.ts
import { renderHook, act } from '@testing-library/react';
import { useSnapDrag } from '../useSnapDrag';
import { CellIndex } from '../lib';

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

const BOX = {
    left: 5,
    top: 5,
    width: 100,
    height: 100,
    right: 105,
    bottom: 105,
    x: 5,
    y: 5,
    toJSON() { },
};

function buildMockElement(box = BOX) {
    const el = document.createElement('div');
    el.getBoundingClientRect = jest.fn(() => box);
    Object.assign(el.style, { left: `${box.left}px`, top: `${box.top}px` });
    return el;
}

type DragCtx = { el: HTMLElement; onDrop: jest.Mock };

function startDrag(): DragCtx {
    const el = buildMockElement();
    const downEvt = {
        currentTarget: el,
        clientX: 10,
        clientY: 20,
        preventDefault: jest.fn(),
    } as unknown as React.PointerEvent<HTMLElement>;
    const onDrop = jest.fn();
    const { result } = renderHook(() => useSnapDrag(onDrop));
    act(() => result.current.down(downEvt, 0 as CellIndex));
    return { el, onDrop };
}

const move = (x: number, y: number) =>
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));

const up = (x = 10, y = 20) =>
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y }));

function setElementFromPoint(attr: string | null | 'N/A') {
    const el = attr === null ? null : document.createElement('div');
    if (el && typeof attr === 'string' && attr !== 'N/A') el.setAttribute('data-cell', attr);
    jest.spyOn(document, 'elementFromPoint').mockReturnValue(el);
}

/* ------------------------------------------------------------------ */
/* tests                                                              */
/* ------------------------------------------------------------------ */

describe('useSnapDrag – basics', () => {
    it('exposes a down() fn', () => {
        const { result } = renderHook(() => useSnapDrag(jest.fn()));
        expect(typeof result.current.down).toBe('function');
    });

    it('applies fixed drag style on pointer‑down', () => {
        const { el } = startDrag();
        expect(el.style.position).toBe('fixed');
        expect(el.style.pointerEvents).toBe('none');
        expect(el.style.width).toBe('100px');
    });
});

describe('drag motion', () => {
    it.each([
        { to: { x: 120, y: 120 }, expectLeft: '115px', expectTop: '105px' },
        { to: { x: 40, y: 50 }, expectLeft: '35px', expectTop: '35px' },
    ])('moves to $to.x,$to.y', ({ to, expectLeft, expectTop }) => {
        const { el } = startDrag();
        move(to.x, to.y);
        expect(el.style.left).toBe(expectLeft);
        expect(el.style.top).toBe(expectTop);
    });

    it('ignores move when element removed', () => {
        const { el } = startDrag();
        el.remove();
        expect(() => move(200, 200)).not.toThrow();
    });
});

describe('drop behaviour', () => {
    it.each([
        { desc: 'different cell', attr: '1', calls: 1, snap: false },
        { desc: 'same cell', attr: '0', calls: 0, snap: true },
        { desc: 'null hit‑test', attr: null, calls: 0, snap: true },
        { desc: 'no data‑cell', attr: 'N/A', calls: 0, snap: true },
    ])('handles $desc', ({ attr, calls, snap }) => {
        const { el, onDrop } = startDrag();
        setElementFromPoint(attr);
        up();
        expect(onDrop).toHaveBeenCalledTimes(calls);

        if (snap) {
            expect(el.style.transition).toMatch(/left .*ms/);
        } else {
            expect(el.style.position).toBe('');
        }
    });

    it('early‑returns when elRef and origin are null', () => {
        const onDrop = jest.fn();
        renderHook(() => useSnapDrag(onDrop));
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 20 }));
        expect(onDrop).not.toHaveBeenCalled();
    });

    it('early‑return on second up after drag ends', () => {
        const addSpy = jest.spyOn(document, 'addEventListener');
        // Spy first, then start drag so we capture the listener
        const { onDrop } = startDrag();
        const upListener = addSpy.mock.calls.find(([e]) => e === 'pointerup')![1] as EventListener;
        upListener(new PointerEvent('pointerup')); // normal finish
        expect(() => upListener(new PointerEvent('pointerup'))).not.toThrow(); // early‑return
        expect(onDrop.mock.calls.length).toBeLessThanOrEqual(1);
        addSpy.mockRestore();
    });

    it('handles drop after element removed mid‑drag', () => {
        const { el } = startDrag();
        el.remove();
        expect(() => up()).not.toThrow();
    });
});

describe('snap‑back cleanup', () => {
    it('clears styles after transitionend', () => {
        const { el } = startDrag();
        setElementFromPoint('0'); // snap‑back scenario
        up();
        el.dispatchEvent(new Event('transitionend'));
        expect(el.style.left).toBe('');
        expect(el.style.position).toBe('');
    });
});

describe('listener bookkeeping', () => {
    let addSpy: jest.SpyInstance, rmSpy: jest.SpyInstance;

    beforeEach(() => {
        addSpy = jest.spyOn(document, 'addEventListener');
        rmSpy = jest.spyOn(document, 'removeEventListener');
    });

    afterEach(() => {
        addSpy.mockRestore();
        rmSpy.mockRestore();
    });

    it('adds & removes listeners once per drag', () => {
        setElementFromPoint('1');
        startDrag(); // add twice
        up(); // remove twice
        expect(addSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
        expect(rmSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
    });
});
