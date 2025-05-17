import {
    render,
    screen,
    cleanup,
    fireEvent,
    act,
} from '@testing-library/react';
import Home from '../page';
import {
    BOARD_ROWS,
    BOARD_COLS,
    CellIndex,
    RANKS,
    SUITS,
    makeStartingCells,
    flightsReducer,
    CardView,
    FlyingCard,
    Flight,
    Cell,
} from '../lib';
import '@testing-library/jest-dom';
import React from 'react';

/* predictable class names ------------------------------------------ */
jest.mock('../page.module.css', () => ({
    score: 'score',
    board: 'board',
    cell: 'cell',
    card: 'card',
    back: 'back',
    flying: 'flying',
}));

/* avoid async delays & animations ---------------------------------- */
beforeAll(() => {
    jest.useFakeTimers();

    global.requestAnimationFrame = (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
    };
    global.cancelAnimationFrame = () => { };

    // Minimal DOMRect shim for JSDOM

    global.DOMRect = class DOMRect {
        x: number;
        y: number;
        width: number;
        height: number;
        top: number;
        right: number;
        bottom: number;
        left: number;

        constructor(x = 0, y = 0, w = 0, h = 0) {
            this.x = x;
            this.y = y;
            this.width = w;
            this.height = h;
            this.top = y;
            this.right = x + w;
            this.bottom = y + h;
            this.left = x;
        }

        static fromRect(other?: DOMRectInit): DOMRect {
            if (!other) return new DOMRect();
            return new DOMRect(other.x, other.y, other.width, other.height);
        }

        toJSON() {
            return {
                x: this.x,
                y: this.y,
                width: this.width,
                height: this.height,
                top: this.top,
                right: this.right,
                bottom: this.bottom,
                left: this.left
            };
        }
    };
});
afterEach(cleanup);

/* helper ------------------------------------------------------------ */
const getCells = () =>
    screen.getAllByRole('generic').filter(el => el.className.includes('cell'));

/* ------------------------------------------------------------------ */
/* 1.  Helpers & reducer                                              */
/* ------------------------------------------------------------------ */
describe('page helpers', () => {
    it('makeStartingCells builds two 26‑card stacks', () => {
        const cells = makeStartingCells();
        expect(cells).toHaveLength(BOARD_ROWS * BOARD_COLS);
        expect(cells[30].length).toBe(26);
        expect(cells[4].length).toBe(26);
        expect(cells.flat().every(c => !c.faceUp)).toBe(true);
    });

    it('flightsReducer add & remove', () => {
        const dummy: Flight = {
            id: 'x',
            src: 0 as CellIndex,
            dst: 1 as CellIndex,
            start: new DOMRect(),
            end: new DOMRect(),
        };
        const added = flightsReducer([], { type: 'ADD', payload: dummy });
        expect(added).toHaveLength(1);
        const removed = flightsReducer(added, { type: 'REMOVE', id: 'x' });
        expect(removed).toHaveLength(0);
    });
});

/* ------------------------------------------------------------------ */
/* 2.  CardView                                                       */
/* ------------------------------------------------------------------ */
describe('CardView component', () => {
    it.each([
        { faceUp: false, icon: '🂠' },
        { faceUp: true, rank: RANKS.Queen, suit: SUITS.Hearts },
    ])('renders correctly – %o', props => {
        render(
            <CardView
                card={{ suit: SUITS.Hearts, rank: RANKS.Queen, faceUp: props.faceUp }}
                onDown={() => { }}
            />,
        );
        if (!props.faceUp) {
            expect(screen.getByText(props.icon!)).toBeInTheDocument();
        } else {
            expect(screen.getByText(props.rank!)).toBeInTheDocument();
            expect(screen.getByText(props.suit!)).toBeInTheDocument();
        }
    });
});

/* ------------------------------------------------------------------ */
/* 3.  FlyingCard                                                     */
/* ------------------------------------------------------------------ */
describe('FlyingCard component', () => {
    it('invokes onFinish after transition', () => {
        const onFinish = jest.fn();
        const flight: Flight = {
            id: 'y',
            src: 0 as CellIndex,
            dst: 1 as CellIndex,
            start: new DOMRect(0, 0, 50, 70),
            end: new DOMRect(100, 100, 50, 70),
        };
        const { container } = render(<FlyingCard flight={flight} onFinish={onFinish} />);
        const flyer = container.querySelector('.flying')!;
        fireEvent.transitionEnd(flyer);
        expect(onFinish).toHaveBeenCalled();
    });

    it('allows custom logic inside onFinish', () => {
        const moveCard = jest.fn();
        const dispatchFlights = jest.fn();
        const flight: Flight = {
            id: 'custom',
            src: 0 as CellIndex,
            dst: 1 as CellIndex,
            start: new DOMRect(),
            end: new DOMRect(),
        };
        const onFinish = () => {
            moveCard(flight.src, flight.dst);
            dispatchFlights({ type: 'REMOVE', id: flight.id });
        };
        const { container } = render(<FlyingCard flight={flight} onFinish={onFinish} />);
        fireEvent.transitionEnd(container.querySelector('.flying')!);
        expect(moveCard).toHaveBeenCalledWith(flight.src, flight.dst);
        expect(dispatchFlights).toHaveBeenCalledWith({ type: 'REMOVE', id: flight.id });
    });
});

/* ------------------------------------------------------------------ */
/* 4.  Home – static content                                          */
/* ------------------------------------------------------------------ */
describe('Home – static elements', () => {
    it.each(['Player 1 Score: 0', 'Player 2 Score: 0'])(
        'shows score: %s',
        txt => {
            render(<Home />);
            expect(screen.getByText(txt)).toBeInTheDocument();
        },
    );

    it('renders 35 cells', () => {
        render(<Home />);
        expect(getCells()).toHaveLength(BOARD_ROWS * BOARD_COLS);
    });
});

/* ------------------------------------------------------------------ */
/* 5.  Home – deal & flight creation                                  */
/* ------------------------------------------------------------------ */
describe('Home – initial deal', () => {
    it('creates .flying elements after timers', () => {
        render(<Home />);
        act(() => jest.runOnlyPendingTimers());
        expect(document.querySelectorAll('.flying').length).toBeGreaterThan(0);
    });
});

/* ------------------------------------------------------------------ */
/* 6.  Drag scenarios                                                 */
/* ------------------------------------------------------------------ */
describe('Home – drag interactions', () => {
    const cases = [
        {
            name: 'moves card between cells',
            run: () => {
                render(<Home />);
                // Wait for all deal timeouts to complete
                act(() => {
                    for (let i = 0; i < 6; i++) {
                        jest.runOnlyPendingTimers();
                    }
                });
                // Wait for flights to complete
                const flyingCards = document.querySelectorAll('.flying');
                flyingCards.forEach(card => {
                    act(() => {
                        fireEvent.transitionEnd(card);
                    });
                });
                // Wait for board state to be ready
                act(() => {
                    jest.runOnlyPendingTimers();
                });
                // Wait for cells to be rendered
                const cells = screen.getAllByRole('generic');
                const visibleCells = cells.filter(el => el.className.includes('cell'));
                expect(visibleCells.length).toBe(BOARD_ROWS * BOARD_COLS);
                // Find a cell with a card
                const src = visibleCells.find(cell => cell.querySelector('.card'));
                expect(src).toBeDefined();
                const card = src!.querySelector('.card');
                expect(card).not.toBeNull();
                // Pick a different cell as destination
                const dst = visibleCells.find(cell => cell !== src)!;
                jest
                    .spyOn(document, 'elementFromPoint')
                    .mockReturnValue(dst as unknown as Element);
                if (card) {
                    act(() => {
                        fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
                        fireEvent.pointerMove(dst, { clientX: 200, clientY: 200 });
                        fireEvent.pointerUp(dst, { clientX: 200, clientY: 200 });
                    });
                    expect(dst.querySelector('.card')).toBeInTheDocument();
                }
            },
        },
        {
            name: 'second card appears while dragging',
            run: () => {
                render(<Home />);
                // Wait for all deal timeouts to complete
                act(() => {
                    // Run all pending timers (6 cards * 1000ms each)
                    for (let i = 0; i < 6; i++) {
                        jest.runOnlyPendingTimers();
                    }
                });

                // Wait for flights to complete
                const flyingCards = document.querySelectorAll('.flying');
                flyingCards.forEach(card => {
                    act(() => {
                        fireEvent.transitionEnd(card);
                    });
                });

                // Wait for board state to be ready
                act(() => {
                    jest.runOnlyPendingTimers();
                });

                // Wait for cells to be rendered
                const cells = screen.getAllByRole('generic');
                const visibleCells = cells.filter(el => el.className.includes('cell'));
                expect(visibleCells.length).toBe(BOARD_ROWS * BOARD_COLS);

                const src = visibleCells[4];
                const card = src.querySelector('.card');
                expect(card).not.toBeNull();
                if (card) {
                    act(() => {
                        fireEvent.pointerDown(card, { clientX: 10, clientY: 10 });
                        fireEvent.pointerMove(src, { clientX: 20, clientY: 20 });
                    });
                    expect(src.querySelectorAll('.card')).toHaveLength(2);
                }
            },
        },
    ] as const;

    test.each(cases)('$name', ({ run }) => run());
});

/* ------------------------------------------------------------------ */
/* 7.  Flight completion                                              */
/* ------------------------------------------------------------------ */
describe('Home – flight completion', () => {
    it('removes flight element on transition end', () => {
        render(<Home />);
        act(() => jest.runOnlyPendingTimers());
        const first = document.querySelector('.flying') as HTMLElement;
        const id = first.getAttribute('data-flight-id');
        fireEvent.transitionEnd(first);
        expect(document.querySelector(`[data-flight-id="${id}"]`)).not.toBeInTheDocument();
    });
});

/* ------------------------------------------------------------------ */
/* 8.  Cell component                                                 */
/* ------------------------------------------------------------------ */
describe('Cell component', () => {
    it('shows second card when dragging same cell', () => {
        const onDown = jest.fn();
        const idx = 0 as CellIndex;
        const stack = [
            { suit: SUITS.Hearts, rank: RANKS.Queen, faceUp: true },
            { suit: SUITS.Spades, rank: RANKS.King, faceUp: true },
        ];
        render(
            <Cell
                idx={idx}
                stack={stack}
                hidden={0}
                dragSrc={idx}
                isDragging
                onDown={onDown}
            />,
        );
        const cards = screen.getAllByRole('img');
        expect(cards).toHaveLength(2);
        fireEvent.pointerDown(cards[1]);
        expect(onDown).toHaveBeenCalledWith(expect.any(Object), idx);
    });

    it('hides second card when dragSrc differs', () => {
        const stack = [
            { suit: SUITS.Hearts, rank: RANKS.Queen, faceUp: true },
            { suit: SUITS.Spades, rank: RANKS.King, faceUp: true },
        ];
        render(
            <Cell
                idx={0 as CellIndex}
                stack={stack}
                hidden={0}
                dragSrc={1 as CellIndex}
                isDragging
                onDown={() => { }}
            />,
        );
        expect(screen.getAllByRole('img')).toHaveLength(1);
    });
});
