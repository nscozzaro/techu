// page.test.tsx
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import Home, { reducer } from '../page';
import { BOARD_ROWS, BOARD_COLS, CellIndex } from '../lib';
import '@testing-library/jest-dom';

/* predictable class names so we can query by .className ---------- */
jest.mock('../page.module.css', () => ({
    score: 'score',
    board: 'board',
    cell: 'cell',
    card: 'card',
    back: 'back',
}));

afterEach(cleanup);

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */
const getCells = () =>
    screen
        .getAllByRole('generic')
        .filter((el) => el.className.includes('cell'));

const pointer = (type: string, clientX = 100, clientY = 100) =>
    new PointerEvent(type, { clientX, clientY });

/* ------------------------------------------------------------------ */
/* static content                                                     */
/* ------------------------------------------------------------------ */
describe('Home – static content', () => {
    it.each([
        ['Player 1 Score: 0'],
        ['Player 2 Score: 0'],
    ])('renders player score: %s', (expected) => {
        render(<Home />);
        expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it('renders the correct number of board cells', () => {
        render(<Home />);
        expect(getCells()).toHaveLength(BOARD_ROWS * BOARD_COLS);
    });
});

/* ------------------------------------------------------------------ */
/* behaviour                                                          */
/* ------------------------------------------------------------------ */
describe('Home – drag and drop logic', () => {
    test('moveCard moves a card from one cell to another', () => {
        render(<Home />);

        const [, dst] = getCells();  // idx 1 – empty neighbour
        const src = getCells()[4];     // idx 4 – black stack

        /* sanity‑check initial state */
        expect(src.querySelector('.card')).toBeInTheDocument();
        expect(dst.querySelector('.card')).toBeNull();

        /* mock the hit‑test so hook thinks pointer is over dst */
        jest.spyOn(document, 'elementFromPoint').mockReturnValue(dst);

        const card = src.querySelector('.card')!;

        act(() => {
            fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
            fireEvent.pointerMove(dst, { clientX: 200, clientY: 200 });
            fireEvent.pointerUp(dst, { clientX: 200, clientY: 200 });
        });

        /* assertions – card relocated */
        expect(dst.querySelector('.card')).toBeInTheDocument();
    });

    test('shows second card only in source cell during drag', () => {
        render(<Home />);

        const src = getCells()[4];   // black stack
        const otherCell = getCells()[30];  // red stack
        const card = src.querySelector('.card')!;

        /* baseline */
        expect(src.querySelectorAll('.card')).toHaveLength(1);

        act(() => fireEvent.pointerDown(card, { clientX: 100, clientY: 100 }));

        expect(src.querySelectorAll('.card')).toHaveLength(2);
        expect(otherCell.querySelectorAll('.card')).toHaveLength(1);

        act(() => fireEvent.pointerUp(document));

        expect(src.querySelectorAll('.card')).toHaveLength(1);
    });

    test('handles drag cancellation by returning to source cell', () => {
        render(<Home />);

        const src = getCells()[4];
        const card = src.querySelector('.card')!;

        act(() => fireEvent.pointerDown(card, { clientX: 100, clientY: 100 }));

        jest.spyOn(document, 'elementFromPoint').mockReturnValue(src);
        act(() => fireEvent.pointerUp(src, { clientX: 100, clientY: 100 }));

        expect(src.querySelectorAll('.card')).toHaveLength(1);
    });

    test('cancels drag when dropping on same cell', () => {
        render(<Home />);
        const src = getCells()[4];  // black stack
        const card = src.querySelector('.card')!;
        const initialCardCount = src.querySelectorAll('.card').length;

        // Start drag
        act(() => fireEvent.pointerDown(card, { clientX: 100, clientY: 100 }));
        expect(src.querySelectorAll('.card')).toHaveLength(initialCardCount + 1);

        // Drop on same cell
        jest.spyOn(document, 'elementFromPoint').mockReturnValue(src);
        act(() => fireEvent.pointerUp(src, { clientX: 100, clientY: 100 }));

        // Verify card stayed in place and second card is hidden
        expect(src.querySelectorAll('.card')).toHaveLength(initialCardCount);

        // Verify card is still in the same cell by checking its content
        const finalCard = src.querySelector('.card')!;
        expect(finalCard).toBe(card);
    });

    test('handles pointer events on second card during drag', () => {
        render(<Home />);
        const src = getCells()[4];  // black stack
        const card = src.querySelector('.card')!;

        // Start drag
        act(() => fireEvent.pointerDown(card, { clientX: 100, clientY: 100 }));

        // Get the second card that appears
        const secondCard = src.querySelectorAll('.card')[1];
        expect(secondCard).toBeInTheDocument();

        // Simulate pointer down on second card
        act(() => fireEvent.pointerDown(secondCard, { clientX: 100, clientY: 100 }));

        // Verify second card is still visible
        expect(src.querySelectorAll('.card')).toHaveLength(2);
    });

    test('handles drag end on document', () => {
        render(<Home />);
        const src = getCells()[4];  // black stack
        const card = src.querySelector('.card')!;

        // Start drag
        act(() => fireEvent.pointerDown(card, { clientX: 100, clientY: 100 }));
        expect(src.querySelectorAll('.card')).toHaveLength(2);

        // End drag on document
        act(() => fireEvent.pointerUp(document));
        expect(src.querySelectorAll('.card')).toHaveLength(1);
    });
});

/* ------------------------------------------------------------------ */
/* pointer‑down callback coverage                                     */
/* ------------------------------------------------------------------ */
describe('pointer‑down wiring (covers inline λ)', () => {
    it('registers global pointermove – proving onPointerDown fired with correct idx', () => {
        const addSpy = jest.spyOn(document, 'addEventListener');
        render(<Home />);

        const cell4Card = getCells()[4].querySelector('.card')!;
        act(() => fireEvent.pointerDown(cell4Card, { clientX: 50, clientY: 60 }));

        /* the Home.handlePointerDown → useSnapDrag.down chain should
           add a "pointermove" listener exactly once. */
        expect(addSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));

        addSpy.mockRestore();
    });
});

/* ------------------------------------------------------------------ */
/* responsive layout smoke‑tests                                      */
/* ------------------------------------------------------------------ */
const viewports = [
    { w: 375, h: 667, label: 'iPhone SE portrait' },
    { w: 667, h: 375, label: 'iPhone SE landscape' },
    { w: 1440, h: 900, label: 'Desktop 1440×900' },
] as const;

describe.each(viewports)(
    'Board layout – %s',
    ({ w, h, label }) => {
        beforeEach(() => {
            Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
            Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
            window.dispatchEvent(new Event('resize'));
        });

        test(`renders correctly on ${label}`, () => {
            const { container } = render(<Home />);
            expect(container.querySelector('.board')).toBeInTheDocument();
            expect(container.querySelectorAll('.cell')).toHaveLength(
                BOARD_ROWS * BOARD_COLS,
            );
        });
    },
);

describe('Home – reducer logic', () => {
    test('handles same-cell drop by resetting drag source', () => {
        const initialState = {
            cells: Array(35).fill([]),
            dragSrc: 4 as CellIndex
        };

        const action = {
            type: 'MOVE' as const,
            from: 4 as CellIndex,
            to: 4 as CellIndex
        };

        const nextState = reducer(initialState, action);
        expect(nextState.dragSrc).toBeNull();
    });
});
