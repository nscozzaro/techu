// app/page.test.tsx

import React from 'react';
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
    RED_SRC,
    BLK_SRC,
} from '../lib';
import '@testing-library/jest-dom';

/* predictable class names */
jest.mock('../page.module.css', () => ({
    score: 'score',
    board: 'board',
    cell: 'cell',
    card: 'card',
    back: 'back',
    flying: 'flying',
}));

/* avoid async delays & animations */
beforeAll(() => {
    jest.useFakeTimers();
    global.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
    global.cancelAnimationFrame = () => { };

    class MockDOMRect {
        x: number; y: number; width: number; height: number;
        top: number; right: number; bottom: number; left: number;
        constructor(x = 0, y = 0, w = 0, h = 0) {
            this.x = x; this.y = y; this.width = w; this.height = h;
            this.top = y; this.right = x + w; this.bottom = y + h; this.left = x;
        }
        static fromRect(other?: DOMRectInit) {
            if (!other) return new MockDOMRect();
            return new MockDOMRect(other.x!, other.y!, other.width!, other.height!);
        }
        toJSON() {
            return {
                x: this.x, y: this.y, width: this.width, height: this.height,
                top: this.top, right: this.right, bottom: this.bottom, left: this.left,
            };
        }
    }
    // @ts-ignore
    global.DOMRect = MockDOMRect;
});
afterEach(cleanup);

const getCells = () =>
    screen.getAllByRole('generic').filter(el => el.className.includes('cell'));

describe('page helpers', () => {
    it('makeStartingCells builds two 26-card stacks', () => {
        const cells = makeStartingCells();
        expect(cells).toHaveLength(BOARD_ROWS * BOARD_COLS);
        expect(cells[30]).toHaveLength(26);
        expect(cells[4]).toHaveLength(26);
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

describe.each([
    { faceUp: false, expected: ['🂠'] },
    { faceUp: true, expected: [RANKS.Queen, SUITS.Hearts] },
])('CardView (faceUp=%s)', ({ faceUp, expected }) => {
    it(`renders ${expected.join(', ')}`, () => {
        render(
            <CardView
                card={{ suit: SUITS.Hearts, rank: RANKS.Queen, faceUp }}
                onDown={() => { }}
            />
        );
        expected.forEach(text =>
            expect(screen.getByText(text)).toBeInTheDocument()
        );
    });
});

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
        const { container } = render(
            <FlyingCard flight={flight} onFinish={onFinish} />
        );
        fireEvent.transitionEnd(container.querySelector('.flying')!);
        expect(onFinish).toHaveBeenCalled();
    });

    it('runs custom logic inside onFinish', () => {
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
        const { container } = render(
            <FlyingCard flight={flight} onFinish={onFinish} />
        );
        fireEvent.transitionEnd(container.querySelector('.flying')!);
        expect(moveCard).toHaveBeenCalledWith(flight.src, flight.dst);
        expect(dispatchFlights).toHaveBeenCalledWith({
            type: 'REMOVE',
            id: flight.id,
        });
    });
});

describe('Home – static elements', () => {
    it.each(['Player 1 Score: 0', 'Player 2 Score: 0'])('shows score "%s"', txt => {
        render(<Home />);
        expect(screen.getByText(txt)).toBeInTheDocument();
    });

    it('renders correct number of cells', () => {
        render(<Home />);
        expect(getCells()).toHaveLength(BOARD_ROWS * BOARD_COLS);
    });
});

describe.each([
    ['schedules exactly 6 deal timers', () => {
        const spy = jest.spyOn(global, 'setTimeout');
        render(<Home />);
        expect(spy).toHaveBeenCalledTimes(6);
        spy.mockRestore();
    }
    ],
    ['creates flying elements after timers', () => {
        render(<Home />);
        act(() => jest.runOnlyPendingTimers());
        expect(document.querySelectorAll('.flying').length).toBeGreaterThan(0);
    }
    ],
])('Home – initial deal: %s', (_name, run) => {
    it('%s', run);
});

describe('Home – drag interactions', () => {
    const cases = [
        {
            name: 'moves card between cells',
            run: () => {
                render(<Home />);
                act(() => { for (let i = 0; i < 6; i++) jest.runOnlyPendingTimers(); });
                document.querySelectorAll('.flying').forEach(card =>
                    act(() => fireEvent.transitionEnd(card))
                );
                act(() => jest.runOnlyPendingTimers());
                const cells = getCells();
                const src = cells.find(c => c.querySelector('.card'))!;
                const dst = cells.find(c => c !== src)!;
                jest.spyOn(document, 'elementFromPoint').mockReturnValue(dst as any);
                const card = src.querySelector('.card')!;
                act(() => {
                    fireEvent.pointerDown(card, { clientX: 10, clientY: 10 });
                    fireEvent.pointerMove(dst, { clientX: 20, clientY: 20 });
                    fireEvent.pointerUp(dst, { clientX: 20, clientY: 20 });
                });
                expect(dst.querySelector('.card')).toBeInTheDocument();
            },
        },
        {
            name: 'board peek-behind shows second card',
            run: () => {
                render(<Home />);
                act(() => { for (let i = 0; i < 6; i++) jest.runOnlyPendingTimers(); });
                document.querySelectorAll('.flying').forEach(card =>
                    act(() => fireEvent.transitionEnd(card))
                );
                act(() => jest.runOnlyPendingTimers());

                const deckCell = getCells()[RED_SRC];
                const targetCell = getCells()[0];
                // Move two cards from deck to the same target
                jest.spyOn(document, 'elementFromPoint').mockReturnValue(targetCell as any);
                for (let move = 0; move < 2; move++) {
                    const top = deckCell.querySelector('.card')!;
                    act(() => {
                        fireEvent.pointerDown(top, { clientX: 5, clientY: 5 });
                        fireEvent.pointerMove(targetCell, { clientX: 100, clientY: 100 });
                        fireEvent.pointerUp(targetCell, { clientX: 100, clientY: 100 });
                    });
                    act(() => jest.runOnlyPendingTimers());
                    document.querySelectorAll('.flying').forEach(card =>
                        act(() => fireEvent.transitionEnd(card))
                    );
                    act(() => jest.runOnlyPendingTimers());
                }

                // Now targetCell has 2 cards; on drag, peek behind should show 2
                const topAtTarget = targetCell.querySelector('.card')!;
                act(() => {
                    fireEvent.pointerDown(topAtTarget, { clientX: 10, clientY: 10 });
                    fireEvent.pointerMove(targetCell, { clientX: 20, clientY: 20 });
                });
                expect(targetCell.querySelectorAll('.card')).toHaveLength(2);
            },
        },
        {
            name: 'deck drag only top card visible',
            run: () => {
                render(<Home />);
                act(() => { for (let i = 0; i < 6; i++) jest.runOnlyPendingTimers(); });
                document.querySelectorAll('.flying').forEach(card =>
                    act(() => fireEvent.transitionEnd(card))
                );
                act(() => jest.runOnlyPendingTimers());

                const deckCell = getCells()[BLK_SRC];
                // Before drag, only one card
                expect(deckCell.querySelectorAll('.card')).toHaveLength(1);
                const top = deckCell.querySelector('.card')!;
                act(() => {
                    fireEvent.pointerDown(top, { clientX: 10, clientY: 10 });
                    fireEvent.pointerMove(deckCell, { clientX: 20, clientY: 20 });
                });
                // During drag, still only one
                expect(deckCell.querySelectorAll('.card')).toHaveLength(1);
            },
        },
    ] as const;

    test.each(cases)('$name', ({ run }) => run());
});

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

describe.each([
    ['shows second card when dragging same cell',
        {
            idx: 0 as CellIndex,
            stack: [
                { suit: SUITS.Hearts, rank: RANKS.Queen, faceUp: true },
                { suit: SUITS.Spades, rank: RANKS.King, faceUp: true },
            ],
            dragSrc: 0 as CellIndex,
            isDragging: true,
            expectedCount: 2,
        }
    ],
    ['hides second card when dragSrc differs',
        {
            idx: 0 as CellIndex,
            stack: [
                { suit: SUITS.Hearts, rank: RANKS.Queen, faceUp: true },
                { suit: SUITS.Spades, rank: RANKS.King, faceUp: true },
            ],
            dragSrc: 1 as CellIndex,
            isDragging: true,
            expectedCount: 1,
        }
    ],
    ['hides second card for deck source',
        {
            idx: BLK_SRC as CellIndex,
            stack: [
                { suit: SUITS.Hearts, rank: RANKS.Queen, faceUp: true },
                { suit: SUITS.Spades, rank: RANKS.King, faceUp: true },
            ],
            dragSrc: BLK_SRC as CellIndex,
            isDragging: true,
            expectedCount: 1,
        }
    ],
])('Cell component: %s', (_name, { idx, stack, dragSrc, isDragging, expectedCount }) => {
    it(`renders ${expectedCount} card(s)`, () => {
        const onDown = jest.fn();
        render(
            <Cell
                idx={idx}
                stack={stack}
                hidden={0}
                dragSrc={dragSrc}
                isDragging={isDragging}
                onDown={onDown}
            />
        );
        const cards = screen.getAllByRole('img');
        expect(cards).toHaveLength(expectedCount);
        if (expectedCount > 1) {
            fireEvent.pointerDown(cards[1]);
            expect(onDown).toHaveBeenCalledWith(expect.any(Object), idx);
        }
    });
});
