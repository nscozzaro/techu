import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import {
    /* domain */
    SUITS, RANKS, SUIT_COLOR, cardColor,
    BOARD_ROWS, BOARD_COLS,
    /* drag-and-drop core */
    useSnapDrag, setPos, clearStyles, snapBack,
    fixedDragStyle,
    /* types */
    Card, PixelPosition, Origin, CellIndex,
    BoardDimension, Suit, Rank,
    /* reducer */
    reducer,
    /* components to cover */
    CardView, Cell,
    RED_SRC, BLK_SRC,
} from '../lib';

/* ------------------------------------------------------------------ */
/*  Generic helpers                                                   */
/* ------------------------------------------------------------------ */

const rnd = (list: readonly unknown[]) =>
    list[Math.floor(Math.random() * list.length)];

const makeDomBox = (xy = { left: 5, top: 5 }) => ({
    ...xy,
    width: 100,
    height: 100,
    right: xy.left + 100,
    bottom: xy.top + 100,
    x: xy.left,
    y: xy.top,
    toJSON() { },
});

const makePointer = (x = 10, y = 20) =>
    new PointerEvent('pointermove', { clientX: x, clientY: y });

function buildMockElement(box = makeDomBox()) {
    const el = document.createElement('div');
    el.getBoundingClientRect = jest.fn(() => box);
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
    return el;
}

/* ------------------------------------------------------------------ */
/*  Pure-data unit tests (suits, ranks, constants …)                  */
/* ------------------------------------------------------------------ */

describe('static card data', () => {
    it('creates a card with random suit + rank', () => {
        const card: Card = {
            suit: rnd(Object.values(SUITS)) as Suit,
            rank: rnd(Object.values(RANKS)) as Rank,
            faceUp: false,
        };
        expect(cardColor(card.suit)).toBe(SUIT_COLOR[card.suit]);
    });

    describe.each(Object.entries(SUIT_COLOR))(
        'color lookup',
        (suit, clr) => {
            it(`returns "${clr}" for ${suit}`, () =>
                expect(cardColor(suit as Suit)).toBe(clr));
        }
    );

    it('board constants are correct', () => {
        expect(BOARD_ROWS).toBe(7);
        expect(BOARD_COLS).toBe(5);
        expect(BOARD_ROWS * BOARD_COLS).toBeGreaterThan(0);
    });
});

/* ------------------------------------------------------------------ */
/*  Hook helpers                                                      */
/* ------------------------------------------------------------------ */

function startDrag(onDrop = jest.fn()) {
    const { result } = renderHook(() => useSnapDrag(onDrop));
    const el = buildMockElement();
    const downEvt = {
        currentTarget: el,
        clientX: 10,
        clientY: 20,
    } as unknown as React.PointerEvent<HTMLElement>;
    act(() => result.current.down(downEvt, 0 as CellIndex));
    return { result, el, onDrop };
}

/* ------------------------------------------------------------------ */
/*  useSnapDrag – behaviour                                           */
/* ------------------------------------------------------------------ */

describe('useSnapDrag', () => {
    it('sets fixed drag style on pointer-down', () => {
        const { el } = startDrag();
        expect(el.style.position).toBe('fixed');
        expect(el.style.pointerEvents).toBe('none');
    });

    describe('pointer-move updates', () => {
        it.each([
            { move: { x: 20, y: 30 }, left: '15px', top: '15px' },
            { move: { x: 40, y: 50 }, left: '35px', top: '35px' },
        ])('moves to $left, $top', ({ move, left, top }) => {
            const { el } = startDrag();
            document.dispatchEvent(makePointer(move.x, move.y));
            expect(el.style.left).toBe(left);
            expect(el.style.top).toBe(top);
        });
    });

    describe('pointer-up scenarios', () => {
        const cases = [
            { target: '1', callsDrop: true },
            { target: '0', callsDrop: false },
            { target: null, callsDrop: false },
            { target: 'N/A', callsDrop: false },
        ] as const;

        it.each(cases)('handles drop target %p', ({ target, callsDrop }) => {
            const { el, onDrop } = startDrag();
            const tgt = target === null ? null : document.createElement('div');
            if (tgt && typeof target === 'string' && target !== 'N/A') tgt.setAttribute('data-cell', target);
            jest.spyOn(document, 'elementFromPoint').mockReturnValue(tgt);
            document.dispatchEvent(
                new PointerEvent('pointerup', { clientX: 15, clientY: 25 })
            );
            if (callsDrop) {
                expect(onDrop).toHaveBeenCalledWith(0, +target!);
                expect(el.style.position).toBe('');
            } else {
                expect(onDrop).not.toHaveBeenCalled();
                expect(el.style.transition).toMatch(/left .*ms/);
            }
        });

        it('ignores pointer-up when no drag active', () => {
            const onDrop = jest.fn();
            const { result } = renderHook(() => useSnapDrag(onDrop));

            // Simulate pointer up without starting a drag
            document.dispatchEvent(
                new PointerEvent('pointerup', { clientX: 0, clientY: 0 })
            );

            // Verify that onDrop was not called
            expect(onDrop).not.toHaveBeenCalled();

            // Verify that the hook is still usable
            expect(result.current.down).toBeInstanceOf(Function);
        });
    });

    it('cleans up listeners', () => {
        const addSpy = jest.spyOn(document, 'addEventListener');
        const removeSpy = jest.spyOn(document, 'removeEventListener');
        const { onDrop } = startDrag();
        const tgt = document.createElement('div');
        tgt.setAttribute('data-cell', '2');
        jest.spyOn(document, 'elementFromPoint').mockReturnValue(tgt);
        document.dispatchEvent(
            new PointerEvent('pointerup', { clientX: 15, clientY: 25 })
        );
        expect(onDrop).toHaveBeenCalled();
        expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
        expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
        addSpy.mockRestore();
        removeSpy.mockRestore();
    });
});

/* ------------------------------------------------------------------ */
/*  Pure-function helpers                                             */
/* ------------------------------------------------------------------ */

describe('pure helpers', () => {
    it('setPos no-ops on nulls', () => {
        const evt = makePointer();
        expect(() => setPos(null, {} as Origin, evt)).not.toThrow();
        expect(() => setPos(document.createElement('div'), null, evt)).not.toThrow();
    });

    it('setPos calculates left/top', () => {
        const el = document.createElement('div');
        const origin: Origin = {
            x: 5 as PixelPosition,
            y: 5 as PixelPosition,
            cell: 0 as CellIndex,
            offX: 2 as PixelPosition,
            offY: 3 as PixelPosition,
        };
        setPos(el, origin, makePointer(12, 18));
        expect(el.style.left).toBe('10px');
        expect(el.style.top).toBe('15px');
    });

    it('clearStyles wipes style', () => {
        const el = document.createElement('div');
        Object.assign(el.style, { position: 'fixed', left: '1px', pointerEvents: 'none' });
        clearStyles(el);
        expect(el.style.position).toBe('');
        expect(el.style.left).toBe('');
    });

    it('snapBack clears on transitionend', () => {
        const el = document.createElement('div');
        snapBack(el, {
            x: 1 as PixelPosition,
            y: 2 as PixelPosition,
            cell: 0 as CellIndex,
            offX: 0 as PixelPosition,
            offY: 0 as PixelPosition,
        });
        el.dispatchEvent(new Event('transitionend'));
        expect(el.style.transition).toBe('');
    });

    it('fixedDragStyle returns correct object', () => {
        const s = fixedDragStyle(makeDomBox({ left: 50, top: 60 }));
        expect(s).toMatchObject({ position: 'fixed', left: '50px', top: '60px', zIndex: '10' });
    });
});

/* ------------------------------------------------------------------ */
/*  Type-brand smoke tests                                            */
/* ------------------------------------------------------------------ */

describe('type brands', () => {
    it('permits branded arithmetic', () => {
        const rows: BoardDimension = 7 as BoardDimension;
        const px: PixelPosition = 42 as PixelPosition;
        const cell: CellIndex = 0 as CellIndex;
        expect(rows + px + cell).toBe(49);
    });
});

/* ------------------------------------------------------------------ */
/*  Reducer tests                                                     */
/* ------------------------------------------------------------------ */

describe('reducer', () => {
    it('MOVE to same cell leaves cells, clears drag', () => {
        const state = { cells: [[], [], []], dragSrc: 0 as CellIndex };
        const next = reducer(state, { type: 'MOVE', from: 1 as CellIndex, to: 1 as CellIndex });
        expect(next).toEqual({ ...state, dragSrc: null });
    });
    it('START_DRAG sets dragSrc', () => {
        const state = { cells: [[], [], []], dragSrc: null };
        const next = reducer(state, { type: 'START_DRAG', src: 1 as CellIndex });
        expect(next.dragSrc).toBe(1);
    });
    it('END_DRAG clears dragSrc', () => {
        const state = { cells: [[], [], []], dragSrc: 1 as CellIndex };
        const next = reducer(state, { type: 'END_DRAG' });
        expect(next.dragSrc).toBeNull();
    });
    it('MOVE transfers and flips card', () => {
        const card = { suit: SUITS.Hearts, rank: RANKS.Ace, faceUp: false };
        const state = { cells: [[card], [], []], dragSrc: 0 as CellIndex };
        const next = reducer(state, { type: 'MOVE', from: 0 as CellIndex, to: 1 as CellIndex });
        expect(next.cells[0]).toEqual([]);
        expect(next.cells[1]).toEqual([{ ...card, faceUp: true }]);
    });
});

/* ------------------------------------------------------------------ */
/*  CardView component tests                                          */
/* ------------------------------------------------------------------ */

describe('CardView component', () => {
    it('renders back side when faceUp=false', () => {
        const card: Card = { suit: SUITS.Spades, rank: RANKS.Ten, faceUp: false };
        const onDown = jest.fn();
        render(<CardView card={card} onDown={onDown} />);
        expect(screen.getByText('🂠')).toBeInTheDocument();
    });

    it('renders rank and suit when faceUp=true with correct color', () => {
        const card: Card = { suit: SUITS.Hearts, rank: RANKS.King, faceUp: true };
        const onDown = jest.fn();
        render(<CardView card={card} onDown={onDown} />);
        const rankEl = screen.getByText(RANKS.King);
        const suitEl = screen.getByText(SUITS.Hearts);
        expect(rankEl).toBeInTheDocument();
        expect(suitEl).toBeInTheDocument();
        // style color on the parent container
        const container = rankEl.parentElement!;
        expect(container.style.color).toBe(SUIT_COLOR[SUITS.Hearts]);
    });

    it('calls onDown when pointerDown occurs', () => {
        const card: Card = { suit: SUITS.Diamonds, rank: RANKS.Ace, faceUp: true };
        const onDown = jest.fn();
        render(<CardView card={card} onDown={onDown} />);
        fireEvent.pointerDown(screen.getByRole('img'));
        expect(onDown).toHaveBeenCalled();
    });
});

/* ------------------------------------------------------------------ */
/*  Cell peek-behind for deck sources                                 */
/* ------------------------------------------------------------------ */

describe.each([
    ['red deck', RED_SRC],
    ['black deck', BLK_SRC],
])('Cell peek-behind on deck (%s)', (_name, idx) => {
    it('shows second card when dragging deck', () => {
        const stack = [
            { suit: SUITS.Clubs, rank: RANKS.Five, faceUp: true },
            { suit: SUITS.Spades, rank: RANKS.Six, faceUp: true },
        ];
        render(
            <Cell
                idx={idx}
                stack={stack}
                hidden={0}
                dragSrc={idx}
                isDragging={true}
                onDown={() => { }}
            />
        );
        const cards = screen.getAllByRole('img');
        expect(cards).toHaveLength(2);
    });
}); 