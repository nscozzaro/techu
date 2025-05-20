/**
 * @jest-environment jsdom
 *
 * lib.test.tsx – full line + branch coverage for lib.tsx
 */
import React from 'react';
import {
    render,
    screen,
    fireEvent,
    waitFor,
} from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';

/* deterministic class names */
jest.mock('../page.module.css', () => ({
    card: 'card',
    back: 'back',
    flying: 'flying',
    cell: 'cell',
}));

import {
    SUITS, RANKS, SUIT_COLOR,
    useSnapDrag, setPos, snapBack,
    useBoard, useFlights, makeStartingCells,
    reducer,
    Card, PixelPosition, Origin, CellIndex,
    BoardDimension, Flight,
    CardView, Cell, FlyingCard,
    RED_SRC, BLK_SRC,
    BOARD_ROWS, BOARD_COLS,
} from '../lib';

/* helpers */
const box = (xy = { left: 5, top: 5 }) => ({ ...xy, width: 50, height: 60, right: xy.left + 50, bottom: xy.top + 60, x: xy.left, y: xy.top, toJSON() { } });
const mockEl = (b = box()) => { const el = document.createElement('div'); (el as HTMLDivElement).getBoundingClientRect = () => b; return el; };
const ptr = (x = 10, y = 20) => new PointerEvent('pointermove', { clientX: x, clientY: y });

/*──────────────── CardView branches ─────────────────────*/
describe('CardView', () => {
    it.each`
    faceUp | hasBack | color
    ${false}|${true} |${''}
    ${true} |${false}|${SUIT_COLOR[SUITS.Hearts]}
  `('faceUp=$faceUp', ({ faceUp, hasBack, color }) => {
        render(<CardView card={{ suit: SUITS.Hearts, rank: RANKS.Two, faceUp }} onDown={() => { }} />);
        const el = screen.getByRole('img');
        expect(el.className.includes('back')).toBe(hasBack);
        expect(el.style.color).toBe(color);
    });
});

/*──────────────── FlyingCard RAF path ──────────────────*/
describe('FlyingCard', () => {
    const saveRAF = global.requestAnimationFrame, saveCAF = global.cancelAnimationFrame;
    beforeAll(() => { jest.useFakeTimers(); global.requestAnimationFrame = cb => (cb(0), 1); global.cancelAnimationFrame = () => { }; });
    afterAll(() => { global.requestAnimationFrame = saveRAF; global.cancelAnimationFrame = saveCAF; jest.useRealTimers(); });

    it('updates style then fires onFinish', async () => {
        const f = { id: 'x', src: 0 as CellIndex, dst: 1 as CellIndex, start: box(), end: box({ left: 120, top: 40 }) };
        const fin = jest.fn(); render(<FlyingCard flight={f} onFinish={fin} />);
        const el = screen.getByText('🂠').parentElement!;
        await waitFor(() => expect(el.style.left).toBe('120px'));
        fireEvent.transitionEnd(el); expect(fin).toHaveBeenCalled();
    });

    it('only calls onFinish once even with multiple transition events', async () => {
        const f = { id: 'x', src: 0 as CellIndex, dst: 1 as CellIndex, start: box(), end: box({ left: 120, top: 40 }) };
        const fin = jest.fn();
        render(<FlyingCard flight={f} onFinish={fin} />);
        const el = screen.getByText('🂠').parentElement!;
        await waitFor(() => expect(el.style.left).toBe('120px'));

        // Trigger multiple transition events
        fireEvent.transitionEnd(el);
        fireEvent.transitionEnd(el);
        fireEvent.transitionEnd(el);

        expect(fin).toHaveBeenCalledTimes(1);
    });
});

/*──────────────── useSnapDrag pointer branches ─────────*/
function initDrag(drop = jest.fn()) {
    const { result } = renderHook(() => useSnapDrag(drop));
    const el = mockEl();
    act(() => result.current.down(
        { currentTarget: el, clientX: 10, clientY: 20 } as unknown as React.PointerEvent<HTMLElement>,
        0 as CellIndex));
    return { el, drop };
}
describe('useSnapDrag pointerUp & pointerMove', () => {
    it('pointermove triggers moveRef (covers assignment)', () => {
        const { el } = initDrag();
        document.dispatchEvent(ptr(20, 30));           // offX=5 offY=15
        expect(el.style.left).toBe('15px');           // 20‑5
        expect(el.style.top).toBe('15px');           // 30‑15
    });

    it('snapBack, clearStyles, and !isActive() guard', () => {
        /* 1️⃣ snapBack */
        let { el, drop } = initDrag();
        jest.spyOn(document, 'elementFromPoint').mockReturnValue(null);
        document.dispatchEvent(new PointerEvent('pointerup', {}));
        expect(el.style.transition).toMatch(/left/);

        /* 2️⃣ clearStyles + onDrop */
        ({ el, drop } = initDrag());
        const tgt = document.createElement('div'); tgt.setAttribute('data-cell', '3');
        jest.spyOn(document, 'elementFromPoint').mockReturnValue(tgt);
        document.dispatchEvent(new PointerEvent('pointerup', {}));
        expect(drop).toHaveBeenCalledWith(0, 3);

        /* 3️⃣ explicit call to pointerUp after drag cleared to hit !isActive() */
        let savedHandler: EventListener | undefined;
        const spyAdd = jest.spyOn(document, 'addEventListener').mockImplementation((t, f, o) => {
            if (t === 'pointerup') savedHandler = f as EventListener;
            return EventTarget.prototype.addEventListener.call(document, t, f, o);
        });
        initDrag();                                    // create a new drag
        document.dispatchEvent(new PointerEvent('pointerup', {})); // finishes drag cleans refs
        if (typeof savedHandler === 'function') {
            savedHandler(new PointerEvent('pointerup', {}));        // isActive() == false
        }
        spyAdd.mockRestore();
    });
});

/*──────────────── utility helpers ─────────────────────*/
describe('utilities', () => {
    it('setPos maths', () => {
        const el = document.createElement('div');
        const o: Origin = { x: 5 as PixelPosition, y: 5 as PixelPosition, cell: 0 as CellIndex, offX: 2 as PixelPosition, offY: 3 as PixelPosition };
        setPos(el, o, ptr(12, 18)); expect(el.style.left).toBe('10px'); expect(el.style.top).toBe('15px');
    });
    it('snapBack clears after transition', () => {
        const el = document.createElement('div');
        snapBack(el, { x: 1 as PixelPosition, y: 1 as PixelPosition, cell: 0 as CellIndex, offX: 0 as PixelPosition, offY: 0 as PixelPosition });
        el.dispatchEvent(new Event('transitionend')); expect(el.style.transition).toBe('');
    });
});

/*──────────────── reducer & useBoard ───────────────────*/
describe('reducer & useBoard', () => {
    it('MOVE same cell returns unchanged', () => {
        const c: Card = { suit: SUITS.Spades, rank: RANKS.Two, faceUp: false };
        const st = { cells: [[c] as Card[], [] as Card[]], dragSrc: 0 as CellIndex };
        const nx = reducer(st, { type: 'MOVE', from: 0 as CellIndex, to: 0 as CellIndex });
        expect(nx.cells).toBe(st.cells); expect(nx.dragSrc).toBeNull();
    });

    it('cards from black source to top row stay face down, others flip face up', () => {
        const { result } = renderHook(() => useBoard());

        // Test 1: Moving from black source to top row (should stay face down)
        act(() => result.current.move(BLK_SRC, 0 as CellIndex));
        expect(result.current.cells[0][0].faceUp).toBe(false);

        // Test 2: Moving from black source to non-top row (should flip face up)
        act(() => result.current.move(BLK_SRC, BOARD_COLS as unknown as CellIndex));
        expect(result.current.cells[BOARD_COLS][0].faceUp).toBe(true);

        // Test 3: Moving from red source to top row (should flip face up)
        act(() => result.current.move(RED_SRC, 0 as CellIndex));
        expect(result.current.cells[0][1].faceUp).toBe(true);
    });

    it('startDrag, endDrag, move', () => {
        const { result } = renderHook(() => useBoard());
        act(() => result.current.startDrag(4 as CellIndex)); expect(result.current.dragSrc).toBe(4);
        act(() => result.current.endDrag()); expect(result.current.dragSrc).toBeNull();
        act(() => result.current.move(RED_SRC, 0 as CellIndex)); expect(result.current.cells[0]).toHaveLength(1);
    });
});

/*──────────────── useFlights ───────────────────────────*/
describe('useFlights', () => {
    const refs = (a: boolean, b: boolean) => ({ current: [a ? mockEl() : null, b ? mockEl() : null] });
    it.each`
    a      | b      | len
    ${false}|${false}|${0}
    ${true} |${false}|${0}
    ${false}|${true} |${0}
    ${true} |${true} |${1}
  `('addFlight guards from=$a to=$b', ({ a, b, len }) => {
        const { result } = renderHook(() => useFlights(refs(a, b) as React.RefObject<Array<HTMLDivElement | null>>, jest.fn()));
        act(() => result.current.addFlight(0 as CellIndex, 1 as CellIndex));
        expect(result.current.flights).toHaveLength(len);
    });

    it('hiddenByCell and completeFlight', () => {
        const ref = { current: [mockEl(), mockEl()] };
        const mv = jest.fn();
        const { result } = renderHook(() => useFlights(ref, mv));
        act(() => result.current.addFlight(0 as CellIndex, 1 as CellIndex));
        act(() => result.current.addFlight(0 as CellIndex, 1 as CellIndex));
        expect(result.current.hiddenByCell(0)).toBe(2);
        const f: Flight = result.current.flights[0];
        act(() => result.current.completeFlight(f));
        expect(mv).toHaveBeenCalledWith(0, 1); expect(result.current.hiddenByCell(0)).toBe(1);
    });
});

/*──────────────── Cell pointerDown ─────────────────────*/
describe('Cell pointerDown', () => {
    it('fires for top & next', () => {
        const pile = [
            { suit: SUITS.Hearts, rank: RANKS.Two, faceUp: true },
            { suit: SUITS.Spades, rank: RANKS.Three, faceUp: true },
        ];
        const cb = jest.fn();
        const { rerender } = render(<Cell idx={8 as CellIndex} stack={pile} hidden={0} dragSrc={null} isDragging={false} onDown={cb} />);
        fireEvent.pointerDown(screen.getByRole('img'));
        rerender(<Cell idx={8 as CellIndex} stack={pile} hidden={0} dragSrc={8 as CellIndex} isDragging={true} onDown={cb} />);
        fireEvent.pointerDown(screen.getAllByRole('img')[1]);
        expect(cb).toHaveBeenCalledTimes(2);
    });

    it('disables pointer events and uses noop for deck cells', () => {
        const pile = [{ suit: SUITS.Hearts, rank: RANKS.Two, faceUp: true }];
        const cb = jest.fn();

        // Test red deck cell
        const { rerender } = render(
            <Cell
                idx={RED_SRC}
                stack={pile}
                hidden={0}
                dragSrc={null}
                isDragging={false}
                onDown={cb}
            />
        );

        // Check that pointer events are disabled
        const cell = screen.getByText('Two').closest('[data-cell="30"]') as HTMLDivElement;
        expect(cell.style.pointerEvents).toBe('none');

        // Try to trigger pointer down - should not call callback
        fireEvent.pointerDown(screen.getByRole('img'));
        expect(cb).not.toHaveBeenCalled();

        // Test black deck cell
        rerender(
            <Cell
                idx={BLK_SRC}
                stack={pile}
                hidden={0}
                dragSrc={null}
                isDragging={false}
                onDown={cb}
            />
        );

        // Check that pointer events are disabled
        expect(cell.style.pointerEvents).toBe('none');

        // Try to trigger pointer down - should not call callback
        fireEvent.pointerDown(screen.getByRole('img'));
        expect(cb).not.toHaveBeenCalled();
    });
});

/*──────────────── misc sanity ─────────────────────────*/
describe('misc', () => {
    it('starting piles sizes', () => {
        const c = makeStartingCells(); expect(c[RED_SRC]).toHaveLength(26); expect(c[BLK_SRC]).toHaveLength(26);
    });
    it('makeStartingCells creates correct initial board state', () => {
        const cells = makeStartingCells();

        // Check total number of cells
        expect(cells).toHaveLength(BOARD_ROWS * BOARD_COLS);

        // Check red source pile (Hearts and Diamonds)
        const redPile = cells[RED_SRC];
        expect(redPile).toHaveLength(26); // 13 ranks * 2 suits
        const redSuits = redPile.map(card => card.suit);
        expect(redSuits.filter(suit => suit === SUITS.Hearts)).toHaveLength(13);
        expect(redSuits.filter(suit => suit === SUITS.Diamonds)).toHaveLength(13);

        // Check black source pile (Clubs and Spades)
        const blackPile = cells[BLK_SRC];
        expect(blackPile).toHaveLength(26); // 13 ranks * 2 suits
        const blackSuits = blackPile.map(card => card.suit);
        expect(blackSuits.filter(suit => suit === SUITS.Clubs)).toHaveLength(13);
        expect(blackSuits.filter(suit => suit === SUITS.Spades)).toHaveLength(13);

        // Check all cards are face down
        expect(redPile.every(card => !card.faceUp)).toBe(true);
        expect(blackPile.every(card => !card.faceUp)).toBe(true);

        // Check all ranks are present
        const allRanks = [...redPile, ...blackPile].map(card => card.rank);
        Object.values(RANKS).forEach(rank => {
            expect(allRanks.filter(r => r === rank)).toHaveLength(4); // Each rank appears 4 times
        });
    });
    it('type‑brands arithmetic', () => {
        const a: BoardDimension = 7 as BoardDimension, b: PixelPosition = 3 as PixelPosition;
        expect(a + b).toBe(10);
    });
});
