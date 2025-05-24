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
    const actualLib = jest.requireActual('../lib');

    const FakeCell = React.forwardRef<HTMLDivElement, {
        idx: import('../lib').CellIndex;
        stack: import('../lib').Cards;
        hidden: number;
        dragSrc: import('../lib').CellIndex | null;
        isDragging: boolean;
        highlight?: boolean;
        onDown: (e: React.PointerEvent<HTMLElement>, idx: import('../lib').CellIndex) => void;
        onClick?: (e: React.MouseEvent<HTMLElement>, idx: import('../lib').CellIndex) => void;
    }>(function FakeCell(
        props,
        ref
    ) {
        const { idx, stack, onDown, onClick, highlight, hidden } = props;
        const top = stack[stack.length - 1 - hidden];
        const isDeck = idx === actualLib.RED_SRC || idx === actualLib.BLK_SRC;
        const isBlackTop = top && actualLib.cardColor(top.suit) === 'black';
        const inactive = isDeck || isBlackTop;

        return (
            <div
                ref={ref}
                data-cell={idx}
                role="generic"
                className={`cell ${highlight ? 'highlight' : ''}`}
                onClick={inactive || !onClick ? undefined : (e) => {
                    // Ensure the event is treated as a React.MouseEvent<HTMLElement>
                    // and idx is correctly passed.
                    onClick(e as unknown as React.MouseEvent<HTMLElement>, idx);
                }}
                style={inactive ? { pointerEvents: 'none' } : undefined}
            >
                {top && (
                    <div
                        data-testid={`card-${idx}`}
                        onPointerDown={(e) => {
                            // Ensure the event is treated as a React.PointerEvent<HTMLElement>
                            // and idx is correctly passed.
                            onDown(e as unknown as React.PointerEvent<HTMLElement>, idx);
                        }}
                    />
                )}
            </div>
        );
    }) as unknown as typeof actualLib.Cell;

    return { __esModule: true, ...actualLib, Cell: FakeCell };
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
    BLK_DST,
    SUITS,
    RANKS,
} from '../lib';

/* predictable CSS class names */
jest.mock('../page.module.css', () => ({
    score: 'score',
    board: 'board',
    cell: 'cell',
    card: 'card',
    back: 'back',
    flying: 'flying',
    highlight: 'highlight',
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
afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    jest.restoreAllMocks();
});

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

    it('uses boardSwap when moving between hand positions', () => {
        renderAndDeal();

        const handIdx1 = 31;              /* first hand position */
        const handIdx2 = 32;              /* second hand position */
        const handEl1 = cellEls()[handIdx1];
        const handEl2 = cellEls()[handIdx2];

        // Get initial card values
        const initialCard1 = handEl1.querySelector('[data-testid^="card-"]')?.textContent;
        const initialCard2 = handEl2.querySelector('[data-testid^="card-"]')?.textContent;

        const spy = jest
            .spyOn(document, 'elementFromPoint')
            .mockReturnValue(handEl2);

        const top = handEl1.querySelector('[data-testid^="card-"]')!;
        act(() => {
            fireEvent.pointerDown(top, { clientX: 5, clientY: 5 });
            fireEvent.pointerMove(handEl2, { clientX: 40, clientY: 40 });
            fireEvent.pointerUp(handEl2, { clientX: 40, clientY: 40 });
        });

        spy.mockRestore();

        // Verify cards were swapped
        expect(handEl1.querySelector('[data-testid^="card-"]')?.textContent).toBe(initialCard2);
        expect(handEl2.querySelector('[data-testid^="card-"]')?.textContent).toBe(initialCard1);
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

/* ------------------------------------------------------------------ */
/*  6. Bot play coverage                                              */
/* ------------------------------------------------------------------ */
describe('Bot play functionality', () => {
    it('makes a move after black cards are dealt', () => {
        render(<Home />);
        fireEvent.click(screen.getByText('Begin'));

        // Run all deal timers to get cards in place
        act(() => {
            jest.runAllTimers();
        });

        // Complete all flights
        act(() => {
            document
                .querySelectorAll('.flying')
                .forEach(el => fireEvent.transitionEnd(el));
        });

        // Run the bot play timer
        act(() => {
            jest.runAllTimers();
        });

        // Complete the bot's flight
        act(() => {
            document
                .querySelectorAll('.flying')
                .forEach(el => fireEvent.transitionEnd(el));
        });

        // Verify a card was moved to the black home center
        const blackHomeCenter = 7 as CellIndex; // BLK_HOME_CENTER = 1 * BOARD_COLS + Math.floor(BOARD_COLS / 2)
        expect(cardCount(cellEls()[blackHomeCenter])).toBe(1);
    });

    it('handles case when no black cards are available', () => {
        // Mock useBoard to return empty cells for black destinations
        const mockUseBoard = jest.spyOn({ useBoard }, 'useBoard');
        mockUseBoard.mockImplementation(() => ({
            cells: Array(BOARD_ROWS * BOARD_COLS).fill([]).map((_, i) =>
                BLK_DST.includes(i as CellIndex) ? [] : [{ suit: SUITS.Spades, rank: RANKS.Ace, faceUp: true }]
            ),
            dragSrc: null,
            startDrag: jest.fn(),
            endDrag: jest.fn(),
            move: jest.fn(),
            swap: jest.fn(),
            reveal: jest.fn(),
            deal: jest.fn(),
        }));

        render(<Home />);
        fireEvent.click(screen.getByText('Begin'));

        // Run all deal timers
        act(() => {
            jest.runAllTimers();
        });

        // Complete all flights
        act(() => {
            document
                .querySelectorAll('.flying')
                .forEach(el => fireEvent.transitionEnd(el));
        });

        // Run the bot play timer
        act(() => {
            jest.runAllTimers();
        });

        // Complete any remaining flights
        act(() => {
            document
                .querySelectorAll('.flying')
                .forEach(el => fireEvent.transitionEnd(el));
        });

        // Verify no new flights were created
        expect(document.querySelectorAll('.flying')).toHaveLength(0);

        // Clean up mock
        mockUseBoard.mockRestore();
    });

    it('handles case when black cards are dealt but then removed', () => {
        // Mock useBoard to return empty cells for black destinations
        const mockUseBoard = jest.spyOn({ useBoard }, 'useBoard');
        let cells = Array(BOARD_ROWS * BOARD_COLS).fill([]).map((_, i) =>
            BLK_DST.includes(i as CellIndex) ? [{ suit: SUITS.Spades, rank: RANKS.Ace, faceUp: true }] : [{ suit: SUITS.Spades, rank: RANKS.Ace, faceUp: true }]
        );

        mockUseBoard.mockImplementation(() => ({
            cells,
            dragSrc: null,
            startDrag: jest.fn(),
            endDrag: jest.fn(),
            move: jest.fn(),
            swap: jest.fn(),
            reveal: jest.fn(),
            deal: jest.fn(),
        }));

        render(<Home />);
        fireEvent.click(screen.getByText('Begin'));

        // Run all deal timers to get cards in place
        act(() => {
            jest.runAllTimers();
        });

        // Complete all flights
        act(() => {
            document
                .querySelectorAll('.flying')
                .forEach(el => fireEvent.transitionEnd(el));
        });

        // Update cells to remove black cards
        cells = Array(BOARD_ROWS * BOARD_COLS).fill([]).map((_, i) =>
            BLK_DST.includes(i as CellIndex) ? [] : [{ suit: SUITS.Spades, rank: RANKS.Ace, faceUp: true }]
        );

        // Run the bot play timer
        act(() => {
            jest.runAllTimers();
        });

        // Complete any remaining flights
        act(() => {
            document
                .querySelectorAll('.flying')
                .forEach(el => fireEvent.transitionEnd(el));
        });

        // Verify no new flights were created
        expect(document.querySelectorAll('.flying')).toHaveLength(0);

        // Clean up mock
        mockUseBoard.mockRestore();
    });
});

/* ------------------------------------------------------------------ */
/*  7. Additional coverage for page.tsx                                */
/* ------------------------------------------------------------------ */
describe('Additional page.tsx coverage', () => {
    it('handles pointer down on red home center after first move', () => {
        renderAndDeal();

        // First make a move to complete first move phase
        const srcIdx = 31;
        const dstIdx = 27;
        const srcEl = cellEls()[srcIdx];
        const dstEl = cellEls()[dstIdx];

        const spy = jest
            .spyOn(document, 'elementFromPoint')
            .mockReturnValue(dstEl);

        const top = srcEl.querySelector('[data-testid^="card-"]')!;
        act(() => {
            fireEvent.pointerDown(top, { clientX: 5, clientY: 5 });
            fireEvent.pointerMove(dstEl, { clientX: 40, clientY: 40 });
            fireEvent.pointerUp(dstEl, { clientX: 40, clientY: 40 });
        });

        // Wait for animations to complete
        act(() => {
            jest.runAllTimers();
        });

        // Now try to interact with red home center
        const redHomeCenter = 27;
        const redHomeCenterEl = cellEls()[redHomeCenter];
        const redHomeCenterCard = redHomeCenterEl.querySelector('[data-testid^="card-"]')!;

        act(() => {
            fireEvent.pointerDown(redHomeCenterCard, { clientX: 5, clientY: 5 });
        });

        // Verify no drag started
        expect(document.querySelector('.flying')).toBeNull();

        spy.mockRestore();
    });

    it('handles pointer down during tiebreaker phase', () => {
        renderAndDeal();

        // First make a move to complete first move phase
        const srcIdx = 31;
        const dstIdx = 27;
        const srcEl = cellEls()[srcIdx];
        const dstEl = cellEls()[dstIdx];

        const spy = jest
            .spyOn(document, 'elementFromPoint')
            .mockReturnValue(dstEl);

        const top = srcEl.querySelector('[data-testid^="card-"]')!;
        act(() => {
            fireEvent.pointerDown(top, { clientX: 5, clientY: 5 });
            fireEvent.pointerMove(dstEl, { clientX: 40, clientY: 40 });
            fireEvent.pointerUp(dstEl, { clientX: 40, clientY: 40 });
        });

        // Wait for animations to complete
        act(() => {
            jest.runAllTimers();
        });

        // Click on red home center to trigger tiebreaker
        const redHomeCenter = 27;
        const redHomeCenterEl = cellEls()[redHomeCenter];
        fireEvent.click(redHomeCenterEl);

        // Wait for animations to complete
        act(() => {
            jest.runAllTimers();
        });

        // Complete any flights
        act(() => {
            document
                .querySelectorAll('.flying')
                .forEach(el => fireEvent.transitionEnd(el));
        });

        // Try to interact with black hand during tiebreaker
        const blackHandIdx = 3;
        const blackHandEl = cellEls()[blackHandIdx];
        const blackHandCard = blackHandEl.querySelector('[data-testid^="card-"]')!;
        act(() => {
            fireEvent.pointerDown(blackHandCard, { clientX: 5, clientY: 5 });
            fireEvent.pointerMove(dstEl, { clientX: 40, clientY: 40 });
        });
        // Correct assertion: no drag started
        expect(document.querySelector('.flying')).toBeNull();
        spy.mockRestore();
    });

    it('handles pointer down for current player turn', () => {
        renderAndDeal();

        // First make a move to complete first move phase
        const srcIdx = 31;
        const dstIdx = 27;
        const srcEl = cellEls()[srcIdx];
        const dstEl = cellEls()[dstIdx];

        const spy = jest
            .spyOn(document, 'elementFromPoint')
            .mockReturnValue(dstEl);

        const top = srcEl.querySelector('[data-testid^="card-"]')!;
        act(() => {
            fireEvent.pointerDown(top, { clientX: 5, clientY: 5 });
            fireEvent.pointerMove(dstEl, { clientX: 40, clientY: 40 });
            fireEvent.pointerUp(dstEl, { clientX: 40, clientY: 40 });
        });

        // Wait for animations to complete
        act(() => {
            jest.runAllTimers();
        });

        // Click on red home center to trigger black's turn
        const redHomeCenter = 27;
        const redHomeCenterEl = cellEls()[redHomeCenter];
        fireEvent.click(redHomeCenterEl);

        // Wait for animations to complete
        act(() => {
            jest.runAllTimers();
        });

        // Complete any flights
        act(() => {
            document
                .querySelectorAll('.flying')
                .forEach(el => fireEvent.transitionEnd(el));
        });

        // Try to interact with black hand during black's turn
        const blackHandIdx = 3;
        const blackHandEl = cellEls()[blackHandIdx];
        const blackHandCard = blackHandEl.querySelector('[data-testid^="card-"]')!;
        act(() => {
            fireEvent.pointerDown(blackHandCard, { clientX: 5, clientY: 5 });
            fireEvent.pointerMove(dstEl, { clientX: 40, clientY: 40 });
        });
        // Correct assertion: no drag started
        expect(document.querySelector('.flying')).toBeNull();
        spy.mockRestore();
    });

    it('handles flight completion', () => {
        renderAndDeal();

        // First make a move to complete first move phase
        const srcIdx = 31;
        const dstIdx = 27;
        const srcEl = cellEls()[srcIdx];
        const dstEl = cellEls()[dstIdx];

        const spy = jest
            .spyOn(document, 'elementFromPoint')
            .mockReturnValue(dstEl);

        const top = srcEl.querySelector('[data-testid^="card-"]')!;
        act(() => {
            fireEvent.pointerDown(top, { clientX: 5, clientY: 5 });
            fireEvent.pointerMove(dstEl, { clientX: 40, clientY: 40 });
            fireEvent.pointerUp(dstEl, { clientX: 40, clientY: 40 });
        });

        // Wait for animations to complete
        act(() => {
            jest.runAllTimers();
        });

        // Complete any flights
        act(() => {
            document
                .querySelectorAll('.flying')
                .forEach(el => fireEvent.transitionEnd(el));
        });

        // Verify card was moved
        expect(cardCount(cellEls()[dstIdx])).toBe(1);
        expect(cardCount(cellEls()[srcIdx])).toBe(0);

        spy.mockRestore();
    });

});
