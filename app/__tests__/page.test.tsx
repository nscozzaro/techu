import { render, screen } from '@testing-library/react';
import Home from '../page';
import { Board } from '../types';

// Mock the styles import
jest.mock('../page.module.css', () => ({
    scoreRow: 'scoreRow',
    board: 'board',
    cell: 'cell',
}));

describe('Home', () => {
    it('renders player scores', () => {
        render(<Home />);

        expect(screen.getByText('Player 1 Score: 0')).toBeInTheDocument();
        expect(screen.getByText('Player 2 Score: 0')).toBeInTheDocument();
    });

    it('renders the correct number of board cells', () => {
        render(<Home />);

        const board = Board.new();
        const expectedCellCount = board.getCells().flat().length;
        const cells = screen.getAllByRole('generic').filter(element =>
            element.className.includes('cell')
        );

        expect(cells).toHaveLength(expectedCellCount);
    });
}); 