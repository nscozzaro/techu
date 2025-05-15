import { renderHook, act } from '@testing-library/react';
import {
    /* domain */
    SUITS, RANKS, SUIT_COLORS, cardColor,
    BOARD_ROWS, BOARD_COLS,
    /* drag‑and‑drop core */
    useSnapDrag, setPos, clearStyles, snapBack,
    cellUnder, calcOrigin, fixedDragStyle,
    /* types */
    Card, PixelPosition, Origin, CellIndex,
    BoardDimension, Suit,
} from '../lib';

/* ------------------------------------------------------------------ */
/*  Generic helpers                                                   */
/* ------------------------------------------------------------------ */

const rnd = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const makeDomBox = (xy = { left: 5, top: 5 }) => ({
    ...xy, width: 100, height: 100, right: xy.left + 100, bottom: xy.top + 100, x: xy.left, y: xy.top, toJSON() { }
});
const makePointer = (x = 10, y = 20) => new PointerEvent('pointermove', { clientX: x, clientY: y });

/** Builds a detached div that behaves like a card element in the real DOM */
function buildMockElement(box = makeDomBox()) {
    const el = document.createElement('div');
    el.getBoundingClientRect = jest.fn(() => box);
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
    return el;
}

/* ------------------------------------------------------------------ */
/*  Pure‑data unit tests (suits, ranks, constants ...)                 */
/* ------------------------------------------------------------------ */

describe('static card data', () => {
    it('creates a card with random suit + rank', () => {
        const card: Card = { suit: rnd(Object.values(SUITS)), rank: rnd(Object.values(RANKS)) };
        expect(cardColor(card.suit)).toBe(SUIT_COLORS[card.suit]);
    });

    describe.each(Object.entries(SUIT_COLORS))('color lookup', (suit, clr) => {
        it(`returns "${clr}" for ${suit}`, () => expect(cardColor(suit as Suit)).toBe(clr));
    });

    it('board constants are positive and correct', () => {
        expect(BOARD_ROWS).toBe(7);
        expect(BOARD_COLS).toBe(5);
        expect(BOARD_ROWS * BOARD_COLS).toBeGreaterThan(0);
    });
});

/* ------------------------------------------------------------------ */
/*  Hook helpers                                                      */
/* ------------------------------------------------------------------ */

function startDrag(onDrop = jest.fn()) {
    /** initialise hook */
    const { result } = renderHook(() => useSnapDrag(onDrop));
    /** mock element & pointer‑down event */
    const el = buildMockElement();
    const downEvt = { currentTarget: el, clientX: 10, clientY: 20 } as unknown as React.PointerEvent<HTMLElement>;
    /** engage drag */
    act(() => result.current.down(downEvt, 0 as CellIndex));
    return { result, el, onDrop };
}

/* ------------------------------------------------------------------ */
/*  useSnapDrag – behaviour                                           */
/* ------------------------------------------------------------------ */

describe('useSnapDrag', () => {
    it('sets fixed drag style on pointer‑down', () => {
        const { el } = startDrag();
        expect(el.style.position).toBe('fixed');
        expect(el.style.pointerEvents).toBe('none');
    });

    describe('pointer‑move position updates', () => {
        it.each([
            { move: { x: 20, y: 30 }, expectLeft: '15px', expectTop: '15px' },
            { move: { x: 40, y: 50 }, expectLeft: '35px', expectTop: '35px' },
        ])('moves to $expectLeft,$expectTop', ({ move, expectLeft, expectTop }) => {
            const { el } = startDrag();
            document.dispatchEvent(makePointer(move.x, move.y));
            expect(el.style.left).toBe(expectLeft);
            expect(el.style.top).toBe(expectTop);
        });
    });

    describe('pointer‑up scenarios', () => {
        const dstCases = [
            { name: 'different cell', target: '1', callsDrop: true },
            { name: 'same cell', target: '0', callsDrop: false },
            { name: 'null hit‑test', target: null, callsDrop: false },
            { name: 'no data‑cell', target: 'N/A', callsDrop: false },
        ] as const;

        it.each(dstCases)('handles $name', ({ target, callsDrop }) => {
            const { el, onDrop } = startDrag();

            // stub elementFromPoint
            const tgtEl = target === null ? null : document.createElement('div');
            if (tgtEl && typeof target === 'string' && target !== 'N/A') {
                tgtEl.setAttribute('data-cell', target);
            }
            jest.spyOn(document, 'elementFromPoint').mockReturnValue(tgtEl);

            document.dispatchEvent(new PointerEvent('pointerup', { clientX: 15, clientY: 25 }));

            if (callsDrop) {
                expect(onDrop).toHaveBeenCalledWith(0, +target!);
            } else {
                expect(onDrop).not.toHaveBeenCalled();
            }

            // if snap‑back expected, transition left/top should be set
            if (!callsDrop) {
                expect(el.style.transition).toMatch(/left .*ms/);
                expect(el.style.left).toBe('5px');
            }
        });

        it('early‑returns when drag inactive (isDragActive === false)', () => {
            const { result } = renderHook(() => useSnapDrag(jest.fn()));
            // simulate stray pointer‑up before any drag
            expect(() =>
                document.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 0 }))
            ).not.toThrow();
            // nothing happened, no refs set
            expect(result.current.down).toBeInstanceOf(Function);
        });
    });

    it('cleans up move + up listeners exactly once', () => {
        const addSpy = jest.spyOn(document, 'addEventListener');
        const removeSpy = jest.spyOn(document, 'removeEventListener');
        const { onDrop } = startDrag();
        // force drop to a new cell
        const target = document.createElement('div'); target.setAttribute('data-cell', '2');
        jest.spyOn(document, 'elementFromPoint').mockReturnValue(target);
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 15, clientY: 25 }));
        expect(onDrop).toHaveBeenCalled();
        expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
        expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
        addSpy.mockRestore(); removeSpy.mockRestore();
    });

    it('executes isDragActive() early‑return on second pointer‑up', () => {
        const addSpy = jest.spyOn(document, 'addEventListener');
        const { onDrop } = startDrag();
        const upListener = addSpy.mock.calls.find(([evt]) => evt === 'pointerup')![1] as EventListener;
        upListener(new PointerEvent('pointerup'));   // first call ends drag
        expect(() => upListener(new PointerEvent('pointerup'))).not.toThrow(); // second hits early return
        expect(onDrop.mock.calls.length).toBeLessThanOrEqual(1);
        addSpy.mockRestore();
    });
});

/* ------------------------------------------------------------------ */
/*  Small pure‑function helpers                                       */
/* ------------------------------------------------------------------ */

describe('pure helpers', () => {
    it('setPos returns early when el or origin is null', () => {
        const evt = makePointer();
        expect(() => setPos(null, {} as Origin, evt)).not.toThrow();
        expect(() => setPos(document.createElement('div'), null, evt)).not.toThrow();
    });

    it('setPos sets correct pixel styles', () => {
        const el = document.createElement('div');
        const origin: Origin = { x: 5 as PixelPosition, y: 5 as PixelPosition, cell: 0 as CellIndex, offX: 2 as PixelPosition, offY: 3 as PixelPosition };
        setPos(el, origin, makePointer(12, 18)); // 12‑2, 18‑3
        expect(el.style.left).toBe('10px');
        expect(el.style.top).toBe('15px');
    });

    it('clearStyles wipes all transient props', () => {
        const el = document.createElement('div');
        Object.assign(el.style, { position: 'fixed', left: '1px', pointerEvents: 'none' });
        clearStyles(el);
        expect(el.style.position).toBe('');
        expect(el.style.left).toBe('');
    });

    it('snapBack animates then clears styles', () => {
        const el = document.createElement('div');
        snapBack(el, { x: 1 as PixelPosition, y: 2 as PixelPosition, cell: 0 as CellIndex, offX: 0 as PixelPosition, offY: 0 as PixelPosition }, 250);
        // simulate transitionend
        el.dispatchEvent(new Event('transitionend'));
        expect(el.style.transition).toBe('');
    });

    describe.each([
        { html: null, expected: undefined, msg: 'null hit‑test' },
        { html: document.createElement('div'), expected: undefined, msg: 'element w/o data‑cell' },
        (() => {
            const el = document.createElement('div'); el.setAttribute('data-cell', '7'); return { html: el, expected: '7', msg: 'direct cell' };
        })(),
        (() => {
            const parent = document.createElement('div'); parent.setAttribute('data-cell', '3');
            const child = document.createElement('div'); parent.appendChild(child);
            return { html: child, expected: '3', msg: 'ancestor cell' };
        })(),
    ])('cellUnder – $msg', ({ html, expected }) => {
        it('returns proper value', () => {
            jest.spyOn(document, 'elementFromPoint').mockReturnValue(html as Element | null);
            expect(cellUnder(makePointer())).toBe(expected);
        });
    });

    it('calcOrigin returns consistent offsets', () => {
        const el = document.createElement('div');
        const box = makeDomBox({ left: 100, top: 200 });
        el.getBoundingClientRect = () => box;
        const evt = { currentTarget: el, clientX: 110, clientY: 220 } as unknown as React.PointerEvent<HTMLElement>;
        const o = calcOrigin(evt, box, 0 as CellIndex);
        expect(o.offX).toBe(10); expect(o.offY).toBe(20);
    });

    it('fixedDragStyle builds correct style object', () => {
        const s = fixedDragStyle(makeDomBox({ left: 50, top: 60 }));
        expect(s).toMatchObject({ position: 'fixed', left: '50px', top: '60px', zIndex: '10' });
    });
});

/* ------------------------------------------------------------------ */
/*  Basic "type" smoke tests (casts)                                   */
/* ------------------------------------------------------------------ */

describe('type brand smoke tests', () => {
    it('accepts branded casts without runtime issues', () => {
        const rows: BoardDimension = 7 as BoardDimension;
        const px: PixelPosition = 42 as PixelPosition;
        const cell: CellIndex = 0 as CellIndex;
        const sum = rows + px + cell; // runtime no‑op, compile‑time brand check
        expect(sum).toBe(49);
    });
});