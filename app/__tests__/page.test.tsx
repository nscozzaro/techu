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
    global.DOMRect = MockDOMRect;
});
afterEach(cleanup);

const getCells = () =>
    screen.getAllByRole('generic').filter(el => el.className.includes('cell'));

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

                // elementFromPoint returns the dst cell directly
                jest.spyOn(document, 'elementFromPoint').mockReturnValue(dst);
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

                // deal two cards from the deck to the same target
                jest.spyOn(document, 'elementFromPoint').mockReturnValue(targetCell);
                for (let i = 0; i < 2; i++) {
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

                // now dragging the top of that 2-card stack should show two
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
                expect(deckCell.querySelectorAll('.card')).toHaveLength(1);

                const top = deckCell.querySelector('.card')!;
                act(() => {
                    fireEvent.pointerDown(top, { clientX: 10, clientY: 10 });
                    fireEvent.pointerMove(deckCell, { clientX: 20, clientY: 20 });
                });
                // During drag, still only one non-fixed card
                expect(deckCell.querySelectorAll('.card:not([style*="position: fixed"])')).toHaveLength(1);
            },
        },
    ] as const;

    test.each(cases)('$name', ({ run }) => run());
});
