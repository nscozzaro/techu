/**
 * @jest-environment jsdom
 *
 * lib.test.tsx – full line + branch coverage for lib.tsx
 */
import React from 'react';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    cleanup,
} from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';

/* deterministic class names ------------------------------------------------ */
jest.mock('../page.module.css', () => ({
    card: 'card',
    back: 'back',
    flying: 'flying',
    cell: 'cell',
}));

/* imports ------------------------------------------------------------------ */
import {
    SUITS, RANKS, SUIT_COLOR,
    useSnapDrag, setPos, snapBack,
    useBoard, useFlights, makeStartingCells,
    reducer,
    Card, PixelPosition, Origin, CellIndex,
    BoardDimension, Flight,
    CardView, Cell, FlyingCard,
    RED_SRC, BLK_SRC, BLK_DST,
    BOARD_COLS, BOARD_ROWS,
    makeBotMove,
} from '../lib';

/* helpers ------------------------------------------------------------------ */
const box = (xy = { left: 5, top: 5 }) => ({
    ...xy,
    width: 50,
    height: 60,
    right: xy.left + 50,
    bottom: xy.top + 60,
    x: xy.left,
    y: xy.top,
    toJSON() { },
});
const mockEl = (b = box()) => {
    const el = document.createElement('div');
    (el as HTMLDivElement).getBoundingClientRect = () => b;
    return el;
};
const ptr = (x = 10, y = 20) =>
    new PointerEvent('pointermove', { clientX: x, clientY: y });

/*───────────────────────────────────────────────────────────────────────────*/
/*  CardView branch coverage                                                 */
/*───────────────────────────────────────────────────────────────────────────*/
describe('CardView', () => {
    it.each`
    faceUp | hasBack | color
    ${false}|${true} |${''}
    ${true} |${false}|${SUIT_COLOR[SUITS.Hearts]}
  `('faceUp=$faceUp', ({ faceUp, hasBack, color }) => {
        render(
            <CardView
                card={{ suit: SUITS.Hearts, rank: RANKS.Two, faceUp }}
                onDown={() => { }}
            />,
        );
        const el = screen.getByRole('img');
        expect(el.className.includes('back')).toBe(hasBack);
        expect(el.style.color).toBe(color);
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  FlyingCard – single‑transition guard                                     */
/*───────────────────────────────────────────────────────────────────────────*/
describe('FlyingCard', () => {
    const saveRAF = global.requestAnimationFrame,
        saveCAF = global.cancelAnimationFrame;
    beforeAll(() => {
        jest.useFakeTimers();
        global.requestAnimationFrame = cb => (cb(0), 1);
        global.cancelAnimationFrame = () => { };
    });
    afterAll(() => {
        global.requestAnimationFrame = saveRAF;
        global.cancelAnimationFrame = saveCAF;
        jest.useRealTimers();
    });

    it('animates then calls onFinish once', async () => {
        const f = {
            id: 'x',
            src: 0 as CellIndex,
            dst: 1 as CellIndex,
            start: box(),
            end: box({ left: 120, top: 40 }),
        };
        const fin = jest.fn();
        render(<FlyingCard flight={f} onFinish={fin} />);
        const el = screen.getByText('🂠').parentElement!;
        await waitFor(() => expect(el.style.left).toBe('120px'));
        fireEvent.transitionEnd(el);
        fireEvent.transitionEnd(el);
        expect(fin).toHaveBeenCalledTimes(1);
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  useSnapDrag – pointer paths & canDrop branch                             */
/*───────────────────────────────────────────────────────────────────────────*/
function initDrag(drop = jest.fn(), cd?: (f: CellIndex, t: CellIndex) => boolean) {
    const { result } = renderHook(() => useSnapDrag(drop, cd));
    const el = mockEl();
    act(() =>
        result.current.down(
            {
                currentTarget: el,
                clientX: 10,
                clientY: 20,
            } as unknown as React.PointerEvent<HTMLElement>,
            0 as CellIndex,
        ),
    );
    return { el, drop };
}

describe('useSnapDrag pointerUp/move', () => {
    it('pointermove triggers moveRef', () => {
        const { el } = initDrag();
        document.dispatchEvent(ptr(20, 30)); // offX  =5, offY  =10
        expect(el.style.left).toBe('15px');
        expect(el.style.top).toBe('15px');
    });

    it('snapBack on canDrop === false (branch coverage)', () => {
        const { el, drop } = initDrag(jest.fn(), () => false);
        const tgt = document.createElement('div');
        tgt.setAttribute('data-cell', '3');
        const spy = jest
            .spyOn(document, 'elementFromPoint')
            .mockReturnValue(tgt);

        document.dispatchEvent(
            new PointerEvent('pointerup', { clientX: 30, clientY: 30 }),
        );
        spy.mockRestore();

        expect(drop).not.toHaveBeenCalled();      // onDrop blocked
        expect(el.style.transition).toMatch(/left/); // snap‑back applied
    });

    it('snapBack when dst === src, and !isActive() guard', () => {
        /* dst === src */
        const { el } = initDrag();
        jest.spyOn(document, 'elementFromPoint').mockReturnValue(null);
        document.dispatchEvent(new PointerEvent('pointerup', {}));
        expect(el.style.transition).toMatch(/left/);

        /* !isActive() */
        let saved: EventListener | undefined;
        const spyAdd = jest
            .spyOn(document, 'addEventListener')
            .mockImplementation((t, f, o) => {
                if (t === 'pointerup') saved = f as EventListener;
                return EventTarget.prototype.addEventListener.call(
                    document,
                    t,
                    f,
                    o,
                );
            });

        initDrag();
        document.dispatchEvent(new PointerEvent('pointerup', {}));
        if (typeof saved === 'function')
            saved(new PointerEvent('pointerup', {}));
        spyAdd.mockRestore();
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  Utilities                                                                */
/*───────────────────────────────────────────────────────────────────────────*/
describe('utilities', () => {
    it('setPos maths', () => {
        const el = document.createElement('div');
        const o: Origin = {
            x: 5 as PixelPosition,
            y: 5 as PixelPosition,
            cell: 0 as CellIndex,
            offX: 2 as PixelPosition,
            offY: 3 as PixelPosition,
        };
        setPos(el, o, ptr(12, 18));
        expect(el.style.left).toBe('10px');
        expect(el.style.top).toBe('15px');
    });

    it('snapBack clears after transition', () => {
        const el = document.createElement('div');
        snapBack(el, {
            x: 1 as PixelPosition,
            y: 1 as PixelPosition,
            cell: 0 as CellIndex,
            offX: 0 as PixelPosition,
            offY: 0 as PixelPosition,
        });
        el.dispatchEvent(new Event('transitionend'));
        expect(el.style.transition).toBe('');
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  reducer & useBoard                                                       */
/*───────────────────────────────────────────────────────────────────────────*/
describe('reducer & useBoard', () => {
    it('MOVE same cell unchanged', () => {
        const c: Card = { suit: SUITS.Spades, rank: RANKS.Two, faceUp: false };
        const st = {
            cells: [[c], []],
            dragSrc: 0 as CellIndex,
        } as unknown as ReturnType<typeof useBoard>;
        const nx = reducer(st, {
            type: 'MOVE',
            from: 0 as CellIndex,
            to: 0 as CellIndex,
        });
        expect(nx.cells).toBe(st.cells);
        expect(nx.dragSrc).toBeNull();
    });

    it('face‑up / face‑down rules', () => {
        const { result } = renderHook(() => useBoard());

        act(() => result.current.move(BLK_SRC, 0 as CellIndex));         // row0
        expect(result.current.cells[0][0].faceUp).toBe(false);

        act(() =>
            result.current.move(
                BLK_SRC,
                BOARD_COLS as unknown as CellIndex,
            ),
        );
        expect(result.current.cells[BOARD_COLS][0].faceUp).toBe(true);

        // First move a card to the black hand
        act(() => result.current.move(BLK_SRC, BLK_DST[0]));
        // Then move from black hand to row 0
        act(() => result.current.move(BLK_DST[0], 0 as CellIndex));
        expect(result.current.cells[0][1].faceUp).toBe(false);
    });

    it('startDrag/endDrag/move', () => {
        const { result } = renderHook(() => useBoard());
        act(() => result.current.startDrag(4 as CellIndex));
        expect(result.current.dragSrc).toBe(4);
        act(() => result.current.endDrag());
        expect(result.current.dragSrc).toBeNull();
        act(() => result.current.move(RED_SRC, 1 as CellIndex));
        expect(result.current.cells[1]).toHaveLength(1);
    });
});

/* swap branch ----------------------------------------------------- */
describe('reducer swap & useBoard.swap', () => {
    it('SWAP action exchanges cards', () => {
        const A = { suit: SUITS.Hearts, rank: RANKS.Two, faceUp: true };
        const B = { suit: SUITS.Hearts, rank: RANKS.Three, faceUp: true };
        const st = {
            cells: [[A], [B]],
            dragSrc: null,
        } as unknown as ReturnType<typeof useBoard>;
        const nx = reducer(st, {
            type: 'SWAP',
            a: 0 as CellIndex,
            b: 1 as CellIndex,
        });
        expect(nx.cells[0][0]).toBe(B);
        expect(nx.cells[1][0]).toBe(A);
    });

    it('SWAP same cell returns unchanged cells', () => {
        const A = { suit: SUITS.Hearts, rank: RANKS.Two, faceUp: true };
        const st = {
            cells: [[A]],
            dragSrc: null,
        } as unknown as ReturnType<typeof useBoard>;
        const nx = reducer(st, {
            type: 'SWAP',
            a: 0 as CellIndex,
            b: 0 as CellIndex,
        });
        expect(nx.cells).toBe(st.cells);
        expect(nx.cells[0][0]).toBe(A);
    });

    it('useBoard.swap exchanges cards in hand', () => {
        const { result } = renderHook(() => useBoard());
        const a = 31 as CellIndex;
        const b = 32 as CellIndex;
        const beforeA = result.current.cells[a][0];
        const beforeB = result.current.cells[b][0];
        act(() => result.current.swap(a, b));
        expect(result.current.cells[a][0]).toBe(beforeB);
        expect(result.current.cells[b][0]).toBe(beforeA);
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  useFlights                                                               */
/*───────────────────────────────────────────────────────────────────────────*/
describe('useFlights', () => {
    const refs = (a: boolean, b: boolean) => ({
        current: [a ? mockEl() : null, b ? mockEl() : null],
    });

    it.each`
    a      | b      | len
    ${false}|${false}|${0}
    ${true} |${false}|${0}
    ${false}|${true} |${0}
    ${true} |${true} |${1}
  `('addFlight guards', ({ a, b, len }) => {
        const { result } = renderHook(() =>
            useFlights(
                refs(a, b) as React.RefObject<(HTMLDivElement | null)[]>,
                jest.fn(),
            ),
        );
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
        expect(mv).toHaveBeenCalledWith(0, 1);
        expect(result.current.hiddenByCell(0)).toBe(1);
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  Cell pointerDown                                                         */
/*───────────────────────────────────────────────────────────────────────────*/
describe('Cell pointerDown', () => {
    it('top & next fires onDown', () => {
        const pile = [
            { suit: SUITS.Hearts, rank: RANKS.Two, faceUp: true },
            { suit: SUITS.Hearts, rank: RANKS.Three, faceUp: true },
        ];
        const cb = jest.fn();
        const { rerender } = render(
            <Cell
                idx={8 as CellIndex}
                stack={pile}
                hidden={0}
                dragSrc={null}
                isDragging={false}
                onDown={cb}
            />,
        );
        fireEvent.pointerDown(screen.getByRole('img'));
        rerender(
            <Cell
                idx={8 as CellIndex}
                stack={pile}
                hidden={0}
                dragSrc={8 as CellIndex}
                isDragging={true}
                onDown={cb}
            />,
        );
        fireEvent.pointerDown(screen.getAllByRole('img')[1]);
        expect(cb).toHaveBeenCalledTimes(2);
    });

    it('deck & black‑top disable interactivity', () => {
        const pile = [{ suit: SUITS.Hearts, rank: RANKS.Two, faceUp: true }];
        const cb = jest.fn();

        /* red deck */
        render(
            <Cell
                idx={RED_SRC}
                stack={pile}
                hidden={0}
                dragSrc={null}
                isDragging={false}
                onDown={cb}
            />,
        );
        fireEvent.pointerDown(screen.getByRole('img'));
        expect(cb).not.toHaveBeenCalled();
        cleanup();

        /* black on top */
        render(
            <Cell
                idx={8 as CellIndex}
                stack={[{ suit: SUITS.Spades, rank: RANKS.Two, faceUp: true }]}
                hidden={0}
                dragSrc={null}
                isDragging={false}
                onDown={cb}
            />,
        );
        fireEvent.pointerDown(screen.getByRole('img'));
        expect(cb).not.toHaveBeenCalled();
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  Misc sanity                                                              */
/*───────────────────────────────────────────────────────────────────────────*/
describe('misc', () => {
    it('starting piles sizes', () => {
        const c = makeStartingCells();
        expect(c[RED_SRC]).toHaveLength(26);
        expect(c[BLK_SRC]).toHaveLength(26);
    });

    it('starting deck correctness', () => {
        const cells = makeStartingCells();
        const redPile = cells[RED_SRC];
        const blackPile = cells[BLK_SRC];
        expect([...redPile, ...blackPile].every(c => !c.faceUp)).toBe(true);
        Object.values(RANKS).forEach(r =>
            expect(
                [...redPile, ...blackPile].filter(c => c.rank === r),
            ).toHaveLength(4),
        );
    });

    it('type‑brand math', () => {
        const a: BoardDimension = 7 as BoardDimension;
        const b: PixelPosition = 3 as PixelPosition;
        expect(a + (b as unknown as number)).toBe(10);
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  Card face-up/down rules                                                  */
/*───────────────────────────────────────────────────────────────────────────*/
describe('shouldKeepFaceDown', () => {
    it('keeps face down for black deck to row 0', () => {
        const { result } = renderHook(() => useBoard());

        // Move from black deck to row 0
        act(() => result.current.move(BLK_SRC, 0 as CellIndex));
        expect(result.current.cells[0][0].faceUp).toBe(false);
    });

    it('keeps face down for black hand to row 1', () => {
        const { result } = renderHook(() => useBoard());

        // First move a card to the black hand
        act(() => result.current.move(BLK_SRC, BLK_DST[0]));

        // Then move from black hand to row 1 center
        act(() => result.current.move(BLK_DST[0], (BOARD_COLS as unknown as CellIndex)));
        expect(result.current.cells[BOARD_COLS][0].faceUp).toBe(false);
    });

    it('turns face up for other moves', () => {
        const { result } = renderHook(() => useBoard());

        // Move from black deck to row 1
        act(() => result.current.move(BLK_SRC, (BOARD_COLS as unknown as CellIndex)));
        expect(result.current.cells[BOARD_COLS][0].faceUp).toBe(true);

        // Move from red deck to row 1
        act(() => result.current.move(RED_SRC, (BOARD_COLS as unknown as CellIndex)));
        expect(result.current.cells[BOARD_COLS][1].faceUp).toBe(true);
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  Bot play logic                                                          */
/*───────────────────────────────────────────────────────────────────────────*/
describe('makeBotMove', () => {
    it('returns early when no cards are available', () => {
        const addFlight = jest.fn();
        const cells = Array(BOARD_ROWS * BOARD_COLS).fill([]);
        const blackDestinations = [31, 32, 33] as CellIndex[];
        const blackHomeCenter = 7 as CellIndex;

        makeBotMove(cells, addFlight, blackDestinations, blackHomeCenter);

        expect(addFlight).not.toHaveBeenCalled();
    });

    it('makes a move when cards are available', () => {
        const addFlight = jest.fn();
        const cells = Array(BOARD_ROWS * BOARD_COLS).fill([]).map((_, i) =>
            [31, 32, 33].includes(i) ? [{ suit: '♠', rank: 'A', faceUp: true }] : []
        );
        const blackDestinations = [31, 32, 33] as CellIndex[];
        const blackHomeCenter = 7 as CellIndex;

        makeBotMove(cells, addFlight, blackDestinations, blackHomeCenter);

        expect(addFlight).toHaveBeenCalledTimes(1);
        expect(addFlight).toHaveBeenCalledWith(
            expect.any(Number),
            blackHomeCenter
        );
    });
});
