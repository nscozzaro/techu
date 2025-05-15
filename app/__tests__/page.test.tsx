import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import Home from '../page';
import { BOARD_ROWS, BOARD_COLS } from '../lib';
import '@testing-library/jest-dom';

/* --- predictable class names for queries --- */
jest.mock('../page.module.css', () => ({
    score: 'score',
    board: 'board',
    cell: 'cell',
    card: 'card',
    back: 'back',
}));

afterEach(cleanup);

describe('Home – static content', () => {
    it.each([
        ['Player 1 Score: 0'],
        ['Player 2 Score: 0'],
    ])('renders player score: %s', expected => {
        render(<Home />);
        expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it('renders the correct number of board cells', () => {
        render(<Home />);
        const expectedCells = BOARD_ROWS * BOARD_COLS;
        const cells = screen
            .getAllByRole('generic')
            .filter(el => el.className.includes('cell'));
        expect(cells).toHaveLength(expectedCells);
    });
});

describe('Home – drag and drop logic', () => {
    test('moveCard moves a card from one cell to another', () => {
        render(<Home />);

        const cells = screen
            .getAllByRole('generic')
            .filter(el => el.className.includes('cell'));

        const src = cells[4];  // top‑right stack (black cards)
        const dst = cells[1];  // an empty neighbouring cell

        /* sanity‑check initial state */
        expect(src.querySelector('.card')).toBeInTheDocument();
        expect(dst.querySelector('.card')).toBeNull();

        /* simulate drag‑drop */
        const card = src.querySelector('.card')!;
        // Mock elementFromPoint to return the destination cell
        jest.spyOn(document, 'elementFromPoint').mockReturnValue(dst);
        act(() => {
            fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
            fireEvent.pointerMove(dst, { clientX: 200, clientY: 200 });
            fireEvent.pointerUp(dst, { clientX: 200, clientY: 200 });
        });

        /* assertions – card relocated */
        expect(src.querySelector('.card')).toBeInTheDocument();
        expect(dst.querySelector('.card')).toBeInTheDocument();
    });

    test('shows second card only in source cell during drag', () => {
        render(<Home />);

        const cells = screen
            .getAllByRole('generic')
            .filter(el => el.className.includes('cell'));

        const src = cells[4];  // top‑right stack (black cards)
        const otherCell = cells[30]; // red cards stack

        /* sanity‑check initial state */
        expect(src.querySelectorAll('.card')).toHaveLength(1);
        expect(otherCell.querySelectorAll('.card')).toHaveLength(1);

        /* start drag */
        const card = src.querySelector('.card')!;
        act(() => {
            fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
        });

        /* assertions during drag */
        expect(src.querySelectorAll('.card')).toHaveLength(2); // top card + next card
        expect(otherCell.querySelectorAll('.card')).toHaveLength(1); // only top card

        /* end drag */
        act(() => {
            fireEvent.pointerUp(document);
        });

        /* assertions after drag */
        expect(src.querySelectorAll('.card')).toHaveLength(1);
        expect(otherCell.querySelectorAll('.card')).toHaveLength(1);
    });

    test('handles drag cancellation by returning to source cell', () => {
        render(<Home />);

        const cells = screen
            .getAllByRole('generic')
            .filter(el => el.className.includes('cell'));

        const src = cells[4];  // top‑right stack (black cards)

        /* start drag */
        const card = src.querySelector('.card')!;
        act(() => {
            fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
        });

        /* verify second card is visible during drag */
        expect(src.querySelectorAll('.card')).toHaveLength(2);

        /* cancel drag by dropping on same cell */
        jest.spyOn(document, 'elementFromPoint').mockReturnValue(src);
        act(() => {
            fireEvent.pointerUp(src, { clientX: 100, clientY: 100 });
        });

        /* verify card returned to original state */
        expect(src.querySelectorAll('.card')).toHaveLength(1);
    });
});

const viewports = [
    { width: 375, height: 667, label: 'iPhone SE portrait' },
    { width: 667, height: 375, label: 'iPhone SE landscape' },
    { width: 1440, height: 900, label: 'Desktop 1440×900' },
] as const;

describe.each(viewports)('Board layout – %s', ({ width, height, label }) => {
    beforeEach(() => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
        window.dispatchEvent(new Event('resize'));
    });

    test(`renders correctly on ${label}`, () => {
        const { container } = render(<Home />);
        expect(container.querySelector('.board')).toBeInTheDocument();
        expect(container.querySelectorAll('.cell')).toHaveLength(BOARD_ROWS * BOARD_COLS);
    });
});
