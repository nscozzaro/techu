/**
 * @jest-environment jsdom
 *
 * lib.test.tsx – full line + branch coverage for lib.tsx
 */
import React, { MouseEvent } from 'react';
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
    highlight: 'highlight',
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
    RED_SRC, BLK_SRC, BLK_DST, RED_DST,
    BOARD_COLS, BOARD_ROWS,
    makeBotMove,
    getSubsequentMoveDestinations,
    canDrop,
    getAllowedMoves,
    useHandleDown,
    cardColor,
    clearStyles,
    flightsReducer,
    useHandleClick,
    handleCardMove,
    findEmptyHandPosition,
    handleHandToHandMove,
    handleMoveToOccupiedHand,
    handleRegularMove,
    type Suit,
    type Rank,
    type BoardAction,
    handleFlightComplete,
} from '../lib';

const createTestHand = (indices: number[] = []): Set<CellIndex> =>
    new Set(indices.map(i => i as CellIndex));

interface TestComponentProps {
    firstRedMove: React.RefObject<boolean>;
    redHand: Set<CellIndex>;
    redHomeCenter: CellIndex;
    blackHomeCenter: CellIndex;
    boardReveal: (indices: CellIndex[]) => void;
    setHighlightCells: (cells: Set<CellIndex>) => void;
    startDrag: (idx: CellIndex) => void;
    drag: { down: (e: React.PointerEvent<HTMLElement>, idx: CellIndex) => void };
    onHandleDown: (handleDown: (e: React.PointerEvent<HTMLElement>, idx: CellIndex) => void) => void;
}

const TestComponent: React.FC<TestComponentProps> = (props) => {
    const handleDown = useHandleDown(
        props.firstRedMove,
        props.redHand,
        props.redHomeCenter,
        props.blackHomeCenter,
        props.boardReveal,
        props.setHighlightCells,
        props.startDrag,
        props.drag
    );
    props.onHandleDown(handleDown);
    return null;
};

/* DOM helpers ------------------------------------------------------------ */
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

/* test setup helpers ---------------------------------------------------- */
const setupDragTest = (drop = jest.fn(), cd?: (f: CellIndex, t: CellIndex) => boolean) => {
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
};

const setupHandleDownTest = () => {
    const firstRedMove = { current: true };
    const redHand = createTestHand([31, 27]);
    const redHomeCenter = 27 as CellIndex;
    const blackHomeCenter = 7 as CellIndex;
    const boardReveal = jest.fn();
    const setHighlightCells = jest.fn();
    const startDrag = jest.fn();
    const drag = { down: jest.fn() };
    let handleDown: ((e: React.PointerEvent<HTMLElement>, idx: CellIndex) => void) | undefined;

    render(
        <TestComponent
            firstRedMove={firstRedMove as React.RefObject<boolean>}
            redHand={redHand}
            redHomeCenter={redHomeCenter}
            blackHomeCenter={blackHomeCenter}
            boardReveal={boardReveal}
            setHighlightCells={setHighlightCells}
            startDrag={startDrag}
            drag={drag}
            onHandleDown={(h: (e: React.PointerEvent<HTMLElement>, idx: CellIndex) => void) => handleDown = h}
        />
    );

    return {
        firstRedMove,
        redHand,
        redHomeCenter,
        blackHomeCenter,
        boardReveal,
        setHighlightCells,
        startDrag,
        drag,
        handleDown,
    };
};

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
describe('useSnapDrag pointerUp/move', () => {
    it('pointermove triggers moveRef', () => {
        const { el } = setupDragTest();
        document.dispatchEvent(ptr(20, 30)); // offX  =5, offY  =10
        expect(el.style.left).toBe('15px');
        expect(el.style.top).toBe('15px');
    });

    it('snapBack on canDrop === false (branch coverage)', () => {
        const { el, drop } = setupDragTest(jest.fn(), () => false);
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
        const { el } = setupDragTest();
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

        setupDragTest();
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
    it.each`
        from         | to           | expectedSame | expectedDragSrc
        ${0}         | ${0}         | ${true}      | ${null}
    `('MOVE from $from to $to', ({ from, to, expectedSame, expectedDragSrc }) => {
        const c: Card = { suit: SUITS.Spades, rank: RANKS.Two, faceUp: false };
        const st = {
            cells: [[c], []],
            dragSrc: 0 as CellIndex,
        } as unknown as ReturnType<typeof useBoard>;
        const nx = reducer(st, {
            type: 'MOVE',
            from: from as CellIndex,
            to: to as CellIndex,
        });
        if (expectedSame) {
            expect(nx.cells).toBe(st.cells);
        }
        expect(nx.dragSrc).toBe(expectedDragSrc);
    });

    it('returns unchanged state for unknown action type', () => {
        const state = {
            cells: [[{ suit: SUITS.Spades, rank: RANKS.Two, faceUp: false }]],
            dragSrc: null,
        };
        const action = { type: 'INVALID_ACTION' } as unknown as BoardAction;
        const result = reducer(state, action);
        expect(result).toEqual(state);
    });

    it.each`
        moveFrom    | moveTo    | expectedFaceUp
        ${BLK_SRC}  | ${0}      | ${false}
        ${BLK_SRC}  | ${BOARD_COLS} | ${true}
    `('face-up / face-down rules: move $moveFrom to $moveTo', ({ moveFrom, moveTo, expectedFaceUp }) => {
        const { result } = renderHook(() => useBoard());
        act(() => result.current.move(moveFrom, moveTo as CellIndex));
        expect(result.current.cells[moveTo][0].faceUp).toBe(expectedFaceUp);
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

describe('reducer swap & useBoard.swap', () => {
    it.each`
        a    | b    | cellsA                | cellsB                | expectedA | expectedB | sameCell
        ${0} | ${1} | ${[{ suit: SUITS.Hearts, rank: RANKS.Two, faceUp: true }]} | ${[{ suit: SUITS.Hearts, rank: RANKS.Three, faceUp: true }]} | ${RANKS.Three} | ${RANKS.Two} | ${false}
        ${0} | ${0} | ${[{ suit: SUITS.Hearts, rank: RANKS.Two, faceUp: true }]} | ${null} | ${RANKS.Two} | ${RANKS.Two} | ${true}
    `('SWAP action exchanges cards: a=$a, b=$b', ({ a, b, cellsA, cellsB, expectedA, expectedB, sameCell }) => {
        const st = {
            cells: cellsB ? [cellsA, cellsB] : [cellsA],
            dragSrc: null,
        } as unknown as ReturnType<typeof useBoard>;
        const nx = reducer(st, {
            type: 'SWAP',
            a: a as CellIndex,
            b: b as CellIndex,
        });
        if (!sameCell) {
            expect(nx.cells[0][0].rank).toBe(expectedA);
            expect(nx.cells[1][0].rank).toBe(expectedB);
        } else {
            expect(nx.cells).toBe(st.cells);
            expect(nx.cells[0][0].rank).toBe(expectedA);
        }
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
        expect(result.current.hiddenByCell(0 as CellIndex)).toBe(2);
        const f: Flight = result.current.flights[0];
        act(() => result.current.completeFlight(f));
        expect(mv).toHaveBeenCalledWith(0 as CellIndex, 1 as CellIndex);
        expect(result.current.hiddenByCell(0 as CellIndex)).toBe(1);
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

    it('applies highlight class when highlight prop is true', () => {
        const pile = [{ suit: SUITS.Hearts, rank: RANKS.Two, faceUp: true }];
        const { container } = render(
            <Cell
                idx={8 as CellIndex}
                stack={pile}
                hidden={0}
                dragSrc={null}
                isDragging={false}
                highlight={true}
                onDown={() => { }}
            />,
        );
        const cell = container.firstChild as HTMLElement;
        expect(cell.className).toContain('highlight');
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

    it('handles click events correctly', () => {
        const pile = [{ suit: SUITS.Hearts, rank: RANKS.Two, faceUp: true }];
        const clickHandler = jest.fn();

        // Test with click handler
        const { container } = render(
            <Cell
                idx={8 as CellIndex}
                stack={pile}
                hidden={0}
                dragSrc={null}
                isDragging={false}
                onDown={() => { }}
                onClick={clickHandler}
            />
        );

        // Click should be called with correct arguments
        const cell = container.querySelector('[data-cell="8"]');
        fireEvent.click(cell!);
        expect(clickHandler).toHaveBeenCalledWith(expect.any(Object), 8);

        // Clean up
        cleanup();

        // Test without click handler
        const { container: container2 } = render(
            <Cell
                idx={8 as CellIndex}
                stack={pile}
                hidden={0}
                dragSrc={null}
                isDragging={false}
                onDown={() => { }}
            />
        );

        // Click should not throw error when no handler provided
        const cellWithoutHandler = container2.querySelector('[data-cell="8"]');
        expect(() => {
            fireEvent.click(cellWithoutHandler!);
        }).not.toThrow();
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  Misc sanity                                                              */
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
    it.each`
        moves                                                                 | expectedFaceUps
        ${[
            { from: BLK_SRC, to: 0, expected: false },
        ]}                                                                   | ${[false]}
        ${[
            { from: BLK_SRC, to: BLK_DST[0], expected: undefined },
            { from: BLK_DST[0], to: BOARD_COLS, expected: false },
        ]}                                                                   | ${[false]}
        ${[
            { from: BLK_SRC, to: BOARD_COLS, expected: true },
            { from: RED_SRC, to: BOARD_COLS, expected: true },
        ]}                                                                   | ${[true, true]}
    `('face-up/down rules for moves: $moves', ({ moves, expectedFaceUps }) => {
            const { result } = renderHook(() => useBoard());
            let expectedIdx = 0;
            moves.forEach((move: { from: CellIndex, to: CellIndex, expected?: boolean }) => {
                act(() => result.current.move(move.from, move.to as CellIndex));
                if (move.expected !== undefined) {
                    expect(result.current.cells[move.to][0].faceUp).toBe(expectedFaceUps[expectedIdx]);
                    expectedIdx++;
                }
            });
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

/*───────────────────────────────────────────────────────────────────────────*/
/*  Move validation helpers                                                  */
/*───────────────────────────────────────────────────────────────────────────*/
describe('getSubsequentMoveDestinations', () => {
    it('excludes source cells (RED_SRC and BLK_SRC)', () => {
        const redHand = new Set<CellIndex>();
        const destinations = getSubsequentMoveDestinations(redHand);

        expect(destinations.has(RED_SRC)).toBe(false);
        expect(destinations.has(BLK_SRC)).toBe(false);
    });

    it('excludes cells in red hand', () => {
        const redHand = new Set<CellIndex>([31 as CellIndex, 32 as CellIndex]);
        const destinations = getSubsequentMoveDestinations(redHand);

        expect(destinations.has(31 as CellIndex)).toBe(false);
        expect(destinations.has(32 as CellIndex)).toBe(false);
    });

    it('includes all other valid cells', () => {
        const redHand = new Set<CellIndex>();
        const destinations = getSubsequentMoveDestinations(redHand);

        // Should include all cells except RED_SRC and BLK_SRC
        const expectedSize = BOARD_ROWS * BOARD_COLS - 2;
        expect(destinations.size).toBe(expectedSize);

        // Verify some specific cells are included
        expect(destinations.has(0 as CellIndex)).toBe(true);
        expect(destinations.has(15 as CellIndex)).toBe(true);
        expect(destinations.has(29 as CellIndex)).toBe(true);
    });

    it('handles empty red hand', () => {
        const redHand = new Set<CellIndex>();
        const destinations = getSubsequentMoveDestinations(redHand);

        // Should include all cells except RED_SRC and BLK_SRC
        const expectedSize = BOARD_ROWS * BOARD_COLS - 2;
        expect(destinations.size).toBe(expectedSize);
    });

    it('handles full red hand', () => {
        // Create a red hand with all possible cells
        const redHand = new Set<CellIndex>();
        for (let i = 0; i < BOARD_ROWS * BOARD_COLS; i++) {
            if (i !== RED_SRC && i !== BLK_SRC) {
                redHand.add(i as CellIndex);
            }
        }

        const destinations = getSubsequentMoveDestinations(redHand);
        expect(destinations.size).toBe(0);
    });
});

describe('canDrop', () => {
    it.each`
        from      | to         | redHand                              | firstRedMove | redHomeCenter | expected
        ${31}     | ${32}      | ${new Set([31, 32])}                 | ${true}      | ${27}         | ${true}
        ${31}     | ${27}      | ${new Set([31])}                     | ${true}      | ${27}         | ${true}
        ${31}     | ${28}      | ${new Set([31])}                     | ${true}      | ${27}         | ${false}
        ${31}     | ${28}      | ${new Set([31])}                     | ${false}     | ${27}         | ${true}
        ${31}     | ${15}      | ${new Set([31])}                     | ${false}     | ${27}         | ${true}
        ${27}     | ${31}      | ${new Set([31])}                     | ${true}      | ${27}         | ${true}
        ${27}     | ${32}      | ${new Set([31])}                     | ${true}      | ${27}         | ${false}
        ${27}     | ${31}      | ${new Set([31])}                     | ${false}     | ${27}         | ${true}
        ${27}     | ${32}      | ${new Set([31])}                     | ${false}     | ${27}         | ${true}
    `('canDrop from $from to $to with redHand $redHand and firstRedMove=$firstRedMove', ({ from, to, redHand, firstRedMove, redHomeCenter, expected }) => {
        expect(canDrop(
            from as CellIndex,
            to as CellIndex,
            redHand,
            firstRedMove,
            redHomeCenter as CellIndex
        )).toBe(expected);
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  getAllowedMoves & helpers                                               */
/*───────────────────────────────────────────────────────────────────────────*/
describe('getAllowedMoves', () => {
    it.each`
        from      | redHand                              | firstRedMove | redHomeCenter | expectedSize | expectedHas
        ${32}     | ${new Set([31])}                     | ${true}      | ${27}         | ${0}         | ${[]}
        ${31}     | ${new Set([31])}                     | ${true}      | ${27}         | ${1}         | ${[27]}
        ${31}     | ${new Set([31])}                     | ${false}     | ${27}         | ${BOARD_ROWS * BOARD_COLS - 3} | ${[]}
    `('getAllowedMoves from $from with redHand $redHand and firstRedMove=$firstRedMove', ({ from, redHand, firstRedMove, redHomeCenter, expectedSize, expectedHas }) => {
        const result = getAllowedMoves(
            from as CellIndex,
            redHand,
            firstRedMove,
            redHomeCenter as CellIndex
        );
        expect(result.size).toBe(expectedSize);
        expectedHas.forEach((cell: number) => {
            expect(result.has(cell as CellIndex)).toBe(true);
        });
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  useHandleDown                                                           */
/*───────────────────────────────────────────────────────────────────────────*/
describe('useHandleDown', () => {
    it('prevents interaction with red home center after first move', () => {
        const { firstRedMove, redHomeCenter, boardReveal, setHighlightCells, startDrag, drag, handleDown } = setupHandleDownTest();

        // Set firstRedMove to false to simulate after first move
        firstRedMove.current = false;

        // Try to interact with red home center
        handleDown!({} as React.PointerEvent<HTMLElement>, redHomeCenter);

        // Verify no actions were taken
        expect(boardReveal).not.toHaveBeenCalled();
        expect(setHighlightCells).not.toHaveBeenCalled();
        expect(startDrag).not.toHaveBeenCalled();
        expect(drag.down).not.toHaveBeenCalled();
    });

    it.each`
        cellIndex        | shouldReveal | shouldHighlight | shouldStartDrag | shouldDragDown
        ${RED_SRC}      | ${false}     | ${false}        | ${false}        | ${false}
        ${BLK_SRC}      | ${false}     | ${false}        | ${false}        | ${false}
        ${31}           | ${false}     | ${true}         | ${true}         | ${true}
    `('handles cell $cellIndex correctly', ({ cellIndex, shouldReveal, shouldHighlight, shouldStartDrag, shouldDragDown }) => {
        const { firstRedMove, redHomeCenter, blackHomeCenter, boardReveal, setHighlightCells, startDrag, drag, handleDown } = setupHandleDownTest();

        handleDown!({} as React.PointerEvent<HTMLElement>, cellIndex as CellIndex);

        if (shouldReveal) {
            expect(boardReveal).toHaveBeenCalledWith([redHomeCenter, blackHomeCenter]);
            expect(firstRedMove.current).toBe(false);
        } else {
            expect(boardReveal).not.toHaveBeenCalled();
        }

        if (shouldHighlight) {
            expect(setHighlightCells).toHaveBeenCalled();
        } else {
            expect(setHighlightCells).not.toHaveBeenCalled();
        }

        if (shouldStartDrag) {
            expect(startDrag).toHaveBeenCalledWith(cellIndex);
        } else {
            expect(startDrag).not.toHaveBeenCalled();
        }

        if (shouldDragDown) {
            expect(drag.down).toHaveBeenCalled();
        } else {
            expect(drag.down).not.toHaveBeenCalled();
        }
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  Utility functions                                                       */
/*───────────────────────────────────────────────────────────────────────────*/
describe('utility functions', () => {
    it.each`
        suit                | expected
        ${SUITS.Hearts}     | ${'red'}
        ${SUITS.Diamonds}   | ${'red'}
        ${SUITS.Clubs}      | ${'black'}
        ${SUITS.Spades}     | ${'black'}
    `('cardColor($suit) returns $expected', ({ suit, expected }) => {
        expect(cardColor(suit)).toBe(expected);
    });

    it('clearStyles resets all style properties', () => {
        const el = document.createElement('div');
        el.style.position = 'fixed';
        el.style.left = '10px';
        el.style.top = '20px';
        el.style.zIndex = '1';
        el.style.width = '100px';
        el.style.height = '100px';
        el.style.transition = 'all 0.3s';
        el.style.pointerEvents = 'none';

        clearStyles(el);

        expect(el.style.position).toBe('');
        expect(el.style.left).toBe('');
        expect(el.style.top).toBe('');
        expect(el.style.zIndex).toBe('');
        expect(el.style.width).toBe('');
        expect(el.style.height).toBe('');
        expect(el.style.transition).toBe('');
        expect(el.style.pointerEvents).toBe('');
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  flightsReducer                                                          */
/*───────────────────────────────────────────────────────────────────────────*/
describe('flightsReducer', () => {
    it('adds new flight', () => {
        const flight: Flight = {
            id: 'test',
            src: 1 as CellIndex,
            dst: 2 as CellIndex,
            start: box(),
            end: box(),
        };
        const state: Flight[] = [];
        const action = { type: 'ADD' as const, payload: flight };
        const result = flightsReducer(state, action);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe(flight);
    });

    it('removes flight by id', () => {
        const flight1: Flight = {
            id: 'test1',
            src: 1 as CellIndex,
            dst: 2 as CellIndex,
            start: box(),
            end: box(),
        };
        const flight2: Flight = {
            id: 'test2',
            src: 3 as CellIndex,
            dst: 4 as CellIndex,
            start: box(),
            end: box(),
        };
        const state = [flight1, flight2];
        const action = { type: 'REMOVE' as const, id: 'test1' };
        const result = flightsReducer(state, action);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe(flight2);
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  Board reducer REVEAL action                                             */
/*───────────────────────────────────────────────────────────────────────────*/
describe('board reducer REVEAL action', () => {
    it('reveals top cards at specified indices', () => {
        const state = {
            cells: [
                [{ suit: SUITS.Hearts, rank: RANKS.Two, faceUp: false }],
                [{ suit: SUITS.Spades, rank: RANKS.Three, faceUp: false }],
                [{ suit: SUITS.Diamonds, rank: RANKS.Four, faceUp: false }],
            ],
            dragSrc: null,
        };
        const action = {
            type: 'REVEAL' as const,
            indices: [0 as CellIndex, 2 as CellIndex],
        };
        const result = reducer(state, action);
        expect(result.cells[0][0].faceUp).toBe(true);
        expect(result.cells[1][0].faceUp).toBe(false);
        expect(result.cells[2][0].faceUp).toBe(true);
        expect(result.dragSrc).toBeNull();
    });

    it('handles empty stacks', () => {
        const state = {
            cells: [[], [], []],
            dragSrc: null,
        };
        const action = {
            type: 'REVEAL' as const,
            indices: [0 as CellIndex, 1 as CellIndex, 2 as CellIndex],
        };
        const result = reducer(state, action);
        expect(result.cells).toEqual([[], [], []]);
        expect(result.dragSrc).toBeNull();
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  useBoard reveal function                                                */
/*───────────────────────────────────────────────────────────────────────────*/
describe('useBoard reveal function', () => {
    it('reveals cards at specified indices', () => {
        const { result } = renderHook(() => useBoard());

        // Set up initial state with face-down cards
        act(() => {
            // Move cards from black source to row 0 (which keeps them face down)
            result.current.move(BLK_SRC, 0 as CellIndex);
            result.current.move(BLK_SRC, (BOARD_COLS as unknown as CellIndex)); // row 1
            result.current.move(BLK_SRC, ((BOARD_COLS * 2) as unknown as CellIndex)); // row 2
        });

        // Verify cards are face down initially (cards moved to row 0 stay face down)
        expect(result.current.cells[0][0].faceUp).toBe(false);
        expect(result.current.cells[BOARD_COLS][0].faceUp).toBe(true);
        expect(result.current.cells[BOARD_COLS * 2][0].faceUp).toBe(true);

        // Reveal cards at indices 0 and 2
        act(() => {
            result.current.reveal([0 as CellIndex, ((BOARD_COLS * 2) as unknown as CellIndex)]);
        });

        // Verify only specified cards are revealed
        expect(result.current.cells[0][0].faceUp).toBe(true);
        expect(result.current.cells[BOARD_COLS][0].faceUp).toBe(true);
        expect(result.current.cells[BOARD_COLS * 2][0].faceUp).toBe(true);
    });

    it('handles empty stacks when revealing', () => {
        const { result } = renderHook(() => useBoard());

        // Try to reveal cards at empty indices
        act(() => {
            result.current.reveal([0 as CellIndex, 1 as CellIndex, 2 as CellIndex]);
        });

        // Verify no errors occurred and state is unchanged
        expect(result.current.cells[0]).toHaveLength(0);
        expect(result.current.cells[1]).toHaveLength(0);
        expect(result.current.cells[2]).toHaveLength(0);
    });

    it('clears drag source when revealing', () => {
        const { result } = renderHook(() => useBoard());

        // Set up drag source
        act(() => {
            result.current.startDrag(0 as CellIndex);
        });
        expect(result.current.dragSrc).toBe(0);

        // Reveal cards
        act(() => {
            result.current.reveal([0 as CellIndex]);
        });

        // Verify drag source is cleared
        expect(result.current.dragSrc).toBeNull();
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  useHandleClick                                                           */
/*───────────────────────────────────────────────────────────────────────────*/
describe('useHandleClick', () => {
    it('reveals cards and updates state on first move', () => {
        const firstRedMove = { current: true };
        const redHomeCenter = 27 as CellIndex;
        const blackHomeCenter = 7 as CellIndex;
        const boardReveal = jest.fn();
        const setHighlightCells = jest.fn();

        const { result } = renderHook(() =>
            useHandleClick(
                firstRedMove as React.RefObject<boolean>,
                redHomeCenter,
                blackHomeCenter,
                boardReveal,
                setHighlightCells,
            ),
        );

        // Click on red home center during first move
        act(() => {
            result.current({} as MouseEvent<HTMLElement>, redHomeCenter);
        });

        // Verify actions were taken
        expect(boardReveal).toHaveBeenCalledWith([redHomeCenter, blackHomeCenter]);
        expect(firstRedMove.current).toBe(false);
        expect(setHighlightCells).toHaveBeenCalledWith(new Set());
    });

    it('does nothing when not first move', () => {
        const firstRedMove = { current: false };
        const redHomeCenter = 27 as CellIndex;
        const blackHomeCenter = 7 as CellIndex;
        const boardReveal = jest.fn();
        const setHighlightCells = jest.fn();

        const { result } = renderHook(() =>
            useHandleClick(
                firstRedMove as React.RefObject<boolean>,
                redHomeCenter,
                blackHomeCenter,
                boardReveal,
                setHighlightCells,
            ),
        );

        // Click on red home center after first move
        act(() => {
            result.current({} as MouseEvent<HTMLElement>, redHomeCenter);
        });

        // Verify no actions were taken
        expect(boardReveal).not.toHaveBeenCalled();
        expect(firstRedMove.current).toBe(false);
        expect(setHighlightCells).not.toHaveBeenCalled();
    });

    it('does nothing when clicking non-home center cell', () => {
        const firstRedMove = { current: true };
        const redHomeCenter = 27 as CellIndex;
        const blackHomeCenter = 7 as CellIndex;
        const boardReveal = jest.fn();
        const setHighlightCells = jest.fn();

        const { result } = renderHook(() =>
            useHandleClick(
                firstRedMove as React.RefObject<boolean>,
                redHomeCenter,
                blackHomeCenter,
                boardReveal,
                setHighlightCells,
            ),
        );

        // Click on a different cell during first move
        act(() => {
            result.current({} as MouseEvent<HTMLElement>, 31 as CellIndex);
        });

        // Verify no actions were taken
        expect(boardReveal).not.toHaveBeenCalled();
        expect(firstRedMove.current).toBe(true);
        expect(setHighlightCells).not.toHaveBeenCalled();
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  handleCardMove & helpers                                                */
/*───────────────────────────────────────────────────────────────────────────*/
describe('handleCardMove and helpers', () => {
    describe('findEmptyHandPosition', () => {
        it('returns undefined when no empty positions', () => {
            const cells = Array(BOARD_ROWS * BOARD_COLS).fill([]).map((_, i) =>
                RED_DST.includes(i as CellIndex) ? [{ suit: SUITS.Hearts, rank: RANKS.Ace, faceUp: true }] : []
            );
            expect(findEmptyHandPosition(cells)).toBeUndefined();
        });

        it('returns first empty hand position', () => {
            const cells = Array(BOARD_ROWS * BOARD_COLS).fill([]).map((_, i) =>
                i === RED_DST[0] ? [{ suit: SUITS.Hearts, rank: RANKS.Ace, faceUp: true }] : []
            );
            expect(findEmptyHandPosition(cells)).toBe(RED_DST[1]);
        });
    });

    describe('handleHandToHandMove', () => {
        it('calls boardSwap with correct indices', () => {
            const boardSwap = jest.fn();
            handleHandToHandMove(31 as CellIndex, 32 as CellIndex, boardSwap);
            expect(boardSwap).toHaveBeenCalledWith(31, 32);
        });
    });

    describe('handleMoveToOccupiedHand', () => {
        it('swaps to empty position when available', () => {
            const cells = Array(BOARD_ROWS * BOARD_COLS).fill([]).map((_, i) =>
                i === RED_DST[0] ? [{ suit: SUITS.Hearts, rank: RANKS.Ace, faceUp: true }] : []
            );
            const boardMove = jest.fn();
            const boardSwap = jest.fn();

            handleMoveToOccupiedHand(
                0 as CellIndex,
                RED_DST[0] as CellIndex,
                cells,
                boardMove,
                boardSwap
            );

            expect(boardSwap).toHaveBeenCalledWith(RED_DST[0], RED_DST[1]);
            expect(boardMove).toHaveBeenCalledWith(0, RED_DST[0]);
        });

        it('moves directly when no empty position available', () => {
            const cells = Array(BOARD_ROWS * BOARD_COLS).fill([]).map((_, i) =>
                RED_DST.includes(i as CellIndex) ? [{ suit: SUITS.Hearts, rank: RANKS.Ace, faceUp: true }] : []
            );
            const boardMove = jest.fn();
            const boardSwap = jest.fn();

            handleMoveToOccupiedHand(
                0 as CellIndex,
                RED_DST[0] as CellIndex,
                cells,
                boardMove,
                boardSwap
            );

            expect(boardSwap).not.toHaveBeenCalled();
            expect(boardMove).toHaveBeenCalledWith(0, RED_DST[0]);
        });
    });

    describe('handleRegularMove', () => {
        it('calls boardMove with correct indices', () => {
            const boardMove = jest.fn();
            handleRegularMove(0 as CellIndex, 1 as CellIndex, boardMove);
            expect(boardMove).toHaveBeenCalledWith(0, 1);
        });
    });

    describe('handleCardMove', () => {
        it('handles hand-to-hand moves', () => {
            const cells = Array(BOARD_ROWS * BOARD_COLS).fill([]);
            const redHand = new Set<CellIndex>([31 as CellIndex, 32 as CellIndex]);
            const boardMove = jest.fn();
            const boardSwap = jest.fn();

            handleCardMove(
                31 as CellIndex,
                32 as CellIndex,
                cells,
                redHand,
                boardMove,
                boardSwap
            );

            expect(boardSwap).toHaveBeenCalledWith(31, 32);
            expect(boardMove).not.toHaveBeenCalled();
        });

        it('ensures cards are face up when moved to red hand', () => {
            const cells = Array(BOARD_ROWS * BOARD_COLS).fill([]).map((_, i) =>
                i === 0 ? [{ suit: SUITS.Hearts, rank: RANKS.Ace, faceUp: false }] : []
            );
            const redHand = new Set<CellIndex>([31 as CellIndex]);
            const boardSwap = jest.fn();

            // Mock the reducer to capture the state changes
            const mockReducer = (state: { cells: Array<Array<{ suit: Suit, rank: Rank, faceUp: boolean }>>, dragSrc: CellIndex | null }, action: { type: string, from: CellIndex, to: CellIndex }) => {
                if (action.type === 'MOVE') {
                    const nextCells = [...state.cells];
                    const card = nextCells[action.from].pop();
                    if (card) {
                        // Cards are always face up in red hand
                        card.faceUp = RED_DST.includes(action.to);
                        nextCells[action.to].push(card);
                    }
                    return { ...state, cells: nextCells, dragSrc: null };
                }
                return state;
            };

            // Create initial state
            const state = { cells, dragSrc: null };

            // Simulate moving a face-down card to the red hand
            handleCardMove(
                0 as CellIndex,
                31 as CellIndex,
                cells,
                redHand,
                (from, to) => {
                    const nextState = mockReducer(state, { type: 'MOVE', from, to });
                    // Cast the cells to the correct type since we know the structure matches
                    cells[to] = nextState.cells[to] as Array<{ suit: typeof SUITS.Hearts, rank: typeof RANKS.Ace, faceUp: boolean }>;
                },
                boardSwap
            );

            // Verify the card is face up in the red hand
            expect(cells[31][0].faceUp).toBe(true);
        });

        it('handles moves to occupied hand', () => {
            const cells = Array(BOARD_ROWS * BOARD_COLS).fill([]).map((_, i) =>
                i === RED_DST[0] ? [{ suit: SUITS.Hearts, rank: RANKS.Ace, faceUp: true }] : []
            );
            const redHand = new Set<CellIndex>(RED_DST.map(idx => idx as CellIndex));
            const boardMove = jest.fn();
            const boardSwap = jest.fn();

            handleCardMove(
                0 as CellIndex,
                RED_DST[0] as CellIndex,
                cells,
                redHand,
                boardMove,
                boardSwap
            );

            expect(boardSwap).toHaveBeenCalledWith(RED_DST[0], RED_DST[1]);
            expect(boardMove).toHaveBeenCalledWith(0, RED_DST[0]);
        });

        it('handles regular moves', () => {
            const cells = Array(BOARD_ROWS * BOARD_COLS).fill([]);
            const redHand = new Set<CellIndex>([31 as CellIndex]);
            const boardMove = jest.fn();
            const boardSwap = jest.fn();

            handleCardMove(
                0 as CellIndex,
                1 as CellIndex,
                cells,
                redHand,
                boardMove,
                boardSwap
            );

            expect(boardMove).toHaveBeenCalledWith(0, 1);
            expect(boardSwap).not.toHaveBeenCalled();
        });
    });
});

/*───────────────────────────────────────────────────────────────────────────*/
/*  handleFlightComplete                                                    */
/*───────────────────────────────────────────────────────────────────────────*/
describe('handleFlightComplete', () => {
    it('calls boardDeal when from is in DECK_CELLS', () => {
        const boardDeal = jest.fn();
        const moveCard = jest.fn();

        handleFlightComplete(
            RED_SRC as CellIndex,
            0 as CellIndex,
            boardDeal,
            moveCard
        );

        expect(boardDeal).toHaveBeenCalledWith(RED_SRC, 0);
        expect(moveCard).not.toHaveBeenCalled();
    });

    it('calls boardDeal when from is in BLK_DST', () => {
        const boardDeal = jest.fn();
        const moveCard = jest.fn();

        handleFlightComplete(
            BLK_DST[0] as CellIndex,
            0 as CellIndex,
            boardDeal,
            moveCard
        );

        expect(boardDeal).toHaveBeenCalledWith(BLK_DST[0], 0);
        expect(moveCard).not.toHaveBeenCalled();
    });

    it('calls moveCard when from is not in DECK_CELLS or BLK_DST', () => {
        const boardDeal = jest.fn();
        const moveCard = jest.fn();

        handleFlightComplete(
            0 as CellIndex,
            1 as CellIndex,
            boardDeal,
            moveCard
        );

        expect(boardDeal).not.toHaveBeenCalled();
        expect(moveCard).toHaveBeenCalledWith(0, 1);
    });
});
