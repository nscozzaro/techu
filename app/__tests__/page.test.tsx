import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import Home from '../page';
import { BOARD_ROWS, BOARD_COLS, CellIndex, reducer } from '../lib';
import '@testing-library/jest-dom';

/* predictable class names for queries ------------------------------- */
jest.mock('../page.module.css', () => ({
    score: 'score',
    board: 'board',
    cell: 'cell',
    card: 'card',
    back: 'back',
}));

afterEach(cleanup);

/* helper utilities -------------------------------------------------- */
const getCells = () =>
    screen.getAllByRole('generic').filter(el => el.className.includes('cell'));

/* ------------------------------------------------------------------ */
/*  Static content                                                    */
/* ------------------------------------------------------------------ */
describe('Home – static content', () => {
    it.each([
        ['Player 1 Score: 0'],
        ['Player 2 Score: 0'],
    ])('renders score: %s', txt => {
        render(<Home />);
        expect(screen.getByText(txt)).toBeInTheDocument();
    });

    it('renders correct number of board cells', () => {
        render(<Home />);
        expect(getCells()).toHaveLength(BOARD_ROWS * BOARD_COLS);
    });
});

/* ------------------------------------------------------------------ */
/*  Drag‑and‑drop behaviour (table‑driven)                            */
/* ------------------------------------------------------------------ */
describe('Home – drag logic', () => {
    type Scenario = {
        name: string;
        run: () => void;
    };

    const scenarios: readonly Scenario[] = [
        {
            name: 'moves card between cells',
            run: () => {
                render(<Home />);

                const cells = getCells();
                const src = cells[4];      // idx 4 (black stack)
                const dst = cells[1];      // idx 1 (empty neighbour)

                // baseline
                expect(src.querySelector('.card')).toBeInTheDocument();
                expect(dst.querySelector('.card')).toBeNull();

                jest.spyOn(document, 'elementFromPoint').mockReturnValue(dst);

                const card = src.querySelector('.card')!;
                act(() => {
                    fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
                    fireEvent.pointerMove(dst, { clientX: 200, clientY: 200 });
                    fireEvent.pointerUp(dst, { clientX: 200, clientY: 200 });
                });

                expect(dst.querySelector('.card')).toBeInTheDocument();
            },
        },
        {
            name: 'shows second card when dragging from stack',
            run: () => {
                render(<Home />);
                const src = getCells()[4]; // idx 4

                // initially one card visible
                expect(src.querySelectorAll('.card')).toHaveLength(1);

                const card = src.querySelector('.card')!;
                act(() => {
                    fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
                    fireEvent.pointerMove(src, { clientX: 150, clientY: 150 });
                });

                // second card revealed
                expect(src.querySelectorAll('.card')).toHaveLength(2);
            },
        },
        {
            name: 'can interact with second card during drag',
            run: () => {
                render(<Home />);
                const src = getCells()[4]; // idx 4
                const topCard = src.querySelector('.card')!;

                act(() => {
                    fireEvent.pointerDown(topCard, { clientX: 100, clientY: 100 });
                    fireEvent.pointerMove(src, { clientX: 150, clientY: 150 });
                });

                const secondCard = src.querySelectorAll('.card')[1];
                expect(secondCard).toBeInTheDocument();

                act(() => {
                    fireEvent.pointerDown(secondCard, { clientX: 150, clientY: 150 });
                });

                expect(secondCard).toBeInTheDocument();
            },
        },
    ] as const;

    test.each(scenarios)('%s', ({ run }) => run());
});

/* ------------------------------------------------------------------ */
/*  Reducer logic smoke test                                          */
/* ------------------------------------------------------------------ */
describe('Home – reducer logic', () => {
    it('resets dragSrc when dropping on same cell', () => {
        const initial = {
            cells: Array(35).fill([]),
            dragSrc: 4 as CellIndex,
        };
        const next = reducer(initial, {
            type: 'MOVE', from: 4 as CellIndex, to: 4 as CellIndex,
        });
        expect(next.dragSrc).toBeNull();
    });
});
