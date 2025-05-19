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
import Home from '../page';
import {
    useFlights,
    useBoard,
    BOARD_ROWS,
    BOARD_COLS,
    RED_SRC,
    CellIndex,
} from '../lib';
import '@testing-library/jest-dom';

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
afterEach(cleanup);

/* helpers ----------------------------------------------------------- */
const cellEls = () =>
    screen.getAllByRole('generic').filter(el => el.className.includes('cell'));
const cardCount = (el: Element) => el.querySelectorAll('.card').length;
const runAllDealTimers = () => {
    /* six setTimeouts (3 red + 3 black) */
    for (let i = 0; i < 6; i++) jest.runOnlyPendingTimers();
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
    /** helper: mount and fully settle initial deal */
    const renderAndDeal = () => {
        render(<Home />);
        fireEvent.click(screen.getByText('Begin'));
        runAllDealTimers();
        document.querySelectorAll('.flying')
            .forEach(el => fireEvent.transitionEnd(el));
        act(() => jest.runOnlyPendingTimers());
    };

    it('renders grid and initial decks', () => {
        renderAndDeal();
        expect(cellEls()).toHaveLength(BOARD_ROWS * BOARD_COLS);
        expect(cellEls()[RED_SRC].querySelectorAll('.card')).toHaveLength(1);
    });

    it('drags card from red deck to an empty cell', () => {
        renderAndDeal();

        const src = cellEls()[RED_SRC];
        const dst = cellEls().find(
            (c, i) => i !== RED_SRC && !c.querySelector('.card'),
        )!;

        const spy = jest.spyOn(document, 'elementFromPoint').mockReturnValue(dst);

        const top = src.querySelector('.card')!;
        act(() => {
            fireEvent.pointerDown(top, { clientX: 5, clientY: 5 });
            fireEvent.pointerMove(dst, { clientX: 40, clientY: 40 });
            fireEvent.pointerUp(dst, { clientX: 40, clientY: 40 });
        });

        spy.mockRestore();

        expect(cardCount(dst)).toBe(1);
        expect(cardCount(src)).toBe(1);
    });

    it('fires completeFlight when a FlyingCard finishes', () => {
        render(<Home />);
        fireEvent.click(screen.getByText('Begin'));

        /* queue first 0‑ms flight */
        act(() => jest.advanceTimersByTime(0));

        const flightEl = document.querySelector('.flying') as HTMLElement | null;
        expect(flightEl).not.toBeNull();       // flight exists

        /* complete this specific flight */
        act(() => {
            fireEvent.transitionEnd(flightEl!);
        });

        /* the original element should be detached */
        expect(flightEl!.isConnected).toBe(false);
    });
});

/* ------------------------------------------------------------------ */
/*  3. useBoard basic sanity                                          */
/* ------------------------------------------------------------------ */
describe('useBoard', () => {
    it('initialises and moves correctly', () => {
        const { result } = renderHook(() => useBoard());
        expect(result.current.cells[RED_SRC]).toHaveLength(26);

        act(() => result.current.move(RED_SRC, 1 as CellIndex));

        expect(result.current.cells[1]).toHaveLength(1);
    });
});
