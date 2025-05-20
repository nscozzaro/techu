/**
 * page.test.tsx – full coverage for UI and logic hooks.
 */
import React from 'react';
import {
    render,
    screen,
    fireEvent,
    act,
    cleanup,
} from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';

/* ------------------------------------------------------------------ */
/*  MOCK: replace Cell so it *always* forwards onDown                 */
/* ------------------------------------------------------------------ */
jest.mock('../lib', () => {
    const actual = jest.requireActual('../lib');

    const FakeCell = React.forwardRef(function FakeCell(
        props: {
            idx: number;
            stack: Array<{ suit: string; rank: string; faceUp: boolean }>;
            onDown: (e: React.PointerEvent<HTMLElement>, idx: number) => void;
        },
        ref: React.Ref<HTMLDivElement>,
    ) {
        const { idx, stack, onDown } = props;
        const top = stack[stack.length - 1];
        return (
            <div
                ref={ref}
                data-cell={idx}
                role="generic"
                className="cell"
            >
                {top && (
                    <div
                        data-testid={`card-${idx}`}
                        onPointerDown={e => onDown(e, idx)}
                    />
                )}
            </div>
        );
    }) as unknown as typeof actual.Cell;

    return { ...actual, Cell: FakeCell };
});

/* ── import AFTER the mock ────────────────────────────────────────── */
import Home from '../page';
import {
    useFlights,
    useBoard,
    BOARD_ROWS,
    BOARD_COLS,
    RED_SRC,
    BLK_SRC,
    CellIndex,
} from '../lib';

/* predictable CSS class names */
jest.mock('../page.module.css', () => ({
    score: 'score',
    board: 'board',
    cell: 'cell',
    card: 'card',
    back: 'back',
    flying: 'flying',
}));

/* ───── JSDOM quirks & timers ───── */
beforeAll(() => {
    jest.useFakeTimers();

    global.requestAnimationFrame = cb => (cb(0), 0);
    global.cancelAnimationFrame = () => { };

    /* DOMRect shim */
    class MockRect implements DOMRect {
        bottom; height; left; right; top; width; x; y;
        constructor(l = 0, t = 0, w = 10, h = 10) {
            this.left = this.x = l;
            this.top = this.y = t;
            this.width = w; this.height = h;
            this.right = l + w;
            this.bottom = t + h;
        }
        toJSON() { return this; }
        static fromRect(r?: Partial<DOMRect>) {
            return new MockRect(r?.x ?? 0, r?.y ?? 0, r?.width ?? 10, r?.height ?? 10);
        }
    }
    (global as unknown as { DOMRect: typeof DOMRect }).DOMRect = MockRect;
});
afterEach(() => { cleanup(); jest.clearAllMocks(); });

/* helpers ----------------------------------------------------------- */
const cellEls = () =>
    screen.getAllByRole('generic').filter(el => el.className.includes('cell'));
const cardCount = (el: Element) =>
    el.querySelectorAll('[data-testid^="card-"]').length;

/** mount <Home/>, start the game, run timers, finish flights */
const renderAndDeal = () => {
    render(<Home />);
    fireEvent.click(screen.getByText('Begin'));

    act(() => {
        jest.runAllTimers(); /* fire all deal timers */
    });

    act(() => { /* finish flights */
        document
            .querySelectorAll('.flying')
            .forEach(el => fireEvent.transitionEnd(el));
    });
};

/* ------------------------------------------------------------------ */
/*  1. useFlights branch coverage                                     */
/* ------------------------------------------------------------------ */
describe('useFlights', () => {
    it('early‑returns when refs missing', () => {
        const refs: React.RefObject<(HTMLDivElement | null)[]> = {
            current: [null, null],
        };
        const move = jest.fn();

        const { result } = renderHook(() => useFlights(refs, move));

        act(() => result.current.addFlight(0 as CellIndex, 1 as CellIndex));

        expect(result.current.flights).toHaveLength(0);
        expect(move).not.toHaveBeenCalled();
    });

    it('adds flight when refs present', () => {
        const a = document.createElement('div');
        const b = document.createElement('div');
        a.getBoundingClientRect = () => new DOMRect(0, 0, 10, 10);
        b.getBoundingClientRect = () => new DOMRect(100, 0, 10, 10);

        const refs: React.RefObject<(HTMLDivElement | null)[]> = {
            current: [a, b],
        };

        const { result } = renderHook(() => useFlights(refs, jest.fn()));

        act(() => result.current.addFlight(0 as CellIndex, 1 as CellIndex));

        expect(result.current.flights).toHaveLength(1);
        expect(result.current.flights[0].end.left).toBe(100);
    });
});

/* ------------------------------------------------------------------ */
/*  2. <Home/> integration tests                                      */
/* ------------------------------------------------------------------ */
describe('<Home/> behaviour', () => {
    it('renders grid and initial decks', () => {
        renderAndDeal();
        expect(cellEls()).toHaveLength(BOARD_ROWS * BOARD_COLS);
        expect(cardCount(cellEls()[RED_SRC])).toBe(1);
    });

    it('first red move only allowed to cell 27', () => {
        renderAndDeal();

        const srcIdx = 31;                /* one of the dealt red cards */
        const dstIdx = 27;                /* centre of red home row */
        const srcEl = cellEls()[srcIdx];
        const dstEl = cellEls()[dstIdx];

        expect(cardCount(srcEl)).toBe(1);
        expect(cardCount(dstEl)).toBe(0);

        const spy = jest
            .spyOn(document, 'elementFromPoint')
            .mockReturnValue(dstEl);

        const top = srcEl.querySelector('[data-testid^="card-"]')!;
        act(() => {
            fireEvent.pointerDown(top, { clientX: 5, clientY: 5 });
            fireEvent.pointerMove(dstEl, { clientX: 40, clientY: 40 });
            fireEvent.pointerUp(dstEl, { clientX: 40, clientY: 40 });
        });

        spy.mockRestore();

        expect(cardCount(dstEl)).toBe(1);
        expect(cardCount(srcEl)).toBe(0);
    });

    it('allows red moves to any cell after first move', () => {
        renderAndDeal();

        const srcIdx = 31;                /* one of the dealt red cards */
        const dstIdx = 27;                /* centre of red home row */
        const srcEl = cellEls()[srcIdx];
        const dstEl = cellEls()[dstIdx];

        // Make first move to center
        const spy = jest
            .spyOn(document, 'elementFromPoint')
            .mockReturnValue(dstEl);

        const top = srcEl.querySelector('[data-testid^="card-"]')!;
        act(() => {
            fireEvent.pointerDown(top, { clientX: 5, clientY: 5 });
            fireEvent.pointerMove(dstEl, { clientX: 40, clientY: 40 });
            fireEvent.pointerUp(dstEl, { clientX: 40, clientY: 40 });
        });

        // Now try moving to a different cell
        const newDstIdx = 28;             /* adjacent to center */
        const newDstEl = cellEls()[newDstIdx];
        spy.mockReturnValue(newDstEl);

        const newTop = dstEl.querySelector('[data-testid^="card-"]')!;
        act(() => {
            fireEvent.pointerDown(newTop, { clientX: 5, clientY: 5 });
            fireEvent.pointerMove(newDstEl, { clientX: 40, clientY: 40 });
            fireEvent.pointerUp(newDstEl, { clientX: 40, clientY: 40 });
        });

        spy.mockRestore();

        expect(cardCount(newDstEl)).toBe(1);
        expect(cardCount(dstEl)).toBe(0);
    });

    it('fires completeFlight when a FlyingCard finishes', () => {
        render(<Home />);
        fireEvent.click(screen.getByText('Begin'));

        act(() => jest.advanceTimersByTime(0)); /* first flight queued */

        const flightEl = document.querySelector('.flying') as HTMLElement | null;
        expect(flightEl).not.toBeNull();

        act(() => {
            fireEvent.transitionEnd(flightEl!);
        });

        expect(flightEl!.isConnected).toBe(false);
    });
});

/* ------------------------------------------------------------------ */
/*  3. dealtRef guard coverage                                        */
/* ------------------------------------------------------------------ */
describe('GameBoard deal guard', () => {
    it('queues deals only once even under React.StrictMode', () => {
        const spy = jest.spyOn(global, 'setTimeout');

        render(
            <React.StrictMode>
                <Home />
            </React.StrictMode>,
        );
        fireEvent.click(screen.getByText('Begin'));

        expect(spy).toHaveBeenCalledTimes(6);
        spy.mockRestore();
    });
});

/* ------------------------------------------------------------------ */
/*  4. useBoard basic sanity                                          */
/* ------------------------------------------------------------------ */
describe('useBoard', () => {
    it('initialises and moves correctly', () => {
        const { result } = renderHook(() => useBoard());
        expect(result.current.cells[RED_SRC]).toHaveLength(26);

        act(() => result.current.move(RED_SRC, 1 as CellIndex));
        expect(result.current.cells[1]).toHaveLength(1);
    });
});

/* ------------------------------------------------------------------ */
/*  5. COVER handleDown guard (deck‑cell early return)                */
/* ------------------------------------------------------------------ */
describe('handleDown early‑return for deck cells', () => {
    it('pointer‑down on deck piles does not start a drag', () => {
        renderAndDeal();

        const redCard = screen.getByTestId(`card-${RED_SRC}`);
        const blackCard = screen.getByTestId(`card-${BLK_SRC}`);

        const redBefore = cardCount(cellEls()[RED_SRC]);
        const blackBefore = cardCount(cellEls()[BLK_SRC]);

        fireEvent.pointerDown(redCard, { clientX: 5, clientY: 5 });
        fireEvent.pointerDown(blackCard, { clientX: 10, clientY: 10 });

        expect(cardCount(cellEls()[RED_SRC])).toBe(redBefore);
        expect(cardCount(cellEls()[BLK_SRC])).toBe(blackBefore);
    });
});
