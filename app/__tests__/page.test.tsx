// __tests__/page.test.tsx
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Home from '../page';
import { BOARD_ROWS, BOARD_COLS } from '../lib';
import '@testing-library/jest-dom';

// ---- mock CSS module so class names are predictable -----------------
jest.mock('../page.module.css', () => ({
    score: 'score',
    board: 'board',
    cell: 'cell',
    card: 'card'
}));

afterEach(cleanup);

describe('Home – static content', () => {
    it.each([
        ['Player 1 Score: 0'],
        ['Player 2 Score: 0'],
    ])('renders player score: %s', (expectedText) => {
        render(<Home />);
        expect(screen.getByText(expectedText)).toBeInTheDocument();
    });

    it('renders the correct number of board cells', () => {
        render(<Home />);
        const expectedCellCount = BOARD_ROWS * BOARD_COLS;

        const cells = screen
            .getAllByRole('generic')
            .filter((el) => el.className.includes('cell'));

        expect(cells).toHaveLength(expectedCellCount);
    });
});

describe('Home – drag and drop logic', () => {
    test('moveCard moves a card from one cell to another', () => {
        render(<Home />);
        // Find all cells
        const cells = screen.getAllByRole('generic').filter((el) => el.className.includes('cell'));
        // The first cell should have a card (Ace of Spades)
        expect(cells[0].querySelector('.card')).toBeInTheDocument();
        // The second cell should be empty
        expect(cells[1].querySelector('.card')).toBeNull();

        // Simulate drag and drop: pointerDown on first cell's card, pointerUp on second cell
        const card = cells[0].querySelector('.card');
        fireEvent.pointerDown(card!);
        // Simulate pointerUp on the second cell
        fireEvent.pointerUp(cells[1]);

        // After move, first cell should be empty, second should have the card
        expect(cells[0].querySelector('.card')).toBeNull();
        expect(cells[1].querySelector('.card')).toBeInTheDocument();
    });
});

const viewports = [
    { width: 375, height: 667, label: 'iPhone SE portrait' },
    { width: 667, height: 375, label: 'iPhone SE landscape' },
    { width: 1440, height: 900, label: 'Desktop 1440×900' },
] as const;

describe.each(viewports)(
    'Board layout – %s',
    ({ width, height, label }) => {
        beforeEach(() => {
            Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
            Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
            window.dispatchEvent(new Event('resize'));
        });

        test(`renders correctly on ${label}`, () => {
            const { container } = render(<Home />);
            const boardFrame = container.querySelector('.board');
            expect(boardFrame).toBeInTheDocument();
            const cells = container.querySelectorAll('.cell');
            expect(cells).toHaveLength(BOARD_ROWS * BOARD_COLS);
        });
    }
);
