// __tests__/page.test.tsx
import { render, screen, cleanup } from '@testing-library/react';
import Home from '../page';
import { Board, BOARD_WIDTH, BOARD_HEIGHT } from '../lib';
import '@testing-library/jest-dom';

// ---- mock CSS module so class names are predictable -----------------
jest.mock('../page.module.css', () => ({
    scoreRow: 'scoreRow',
    board: 'board',
    cell: 'cell',
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
        const board = Board.new();
        const expectedCellCount = board.getCells().flat().length;

        const cells = screen
            .getAllByRole('generic')
            .filter((el) => el.className.includes('cell'));

        expect(cells).toHaveLength(expectedCellCount);
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
            expect(cells).toHaveLength(BOARD_WIDTH * BOARD_HEIGHT);
        });
    }
);
