'use client';

import {
  BOARD_ROWS,
  BOARD_COLS,
  SUITS,
  RANKS,
  Card,
  Cards,
  cardColor,
  useSnapDrag,
  CellIndex,
} from './lib';
import styles from './page.module.css';
import {
  PointerEvent as ReactPointerEvent,
  Reducer,
  useCallback,
  useEffect,
  useReducer,
} from 'react';

interface BoardState {
  cells: Cards[];
  dragSrc: CellIndex | null;
}

type Action =
  | { type: 'MOVE'; from: CellIndex; to: CellIndex }
  | { type: 'START_DRAG'; src: CellIndex }
  | { type: 'END_DRAG' };

export const reducer: Reducer<BoardState, Action> = (state, action) => {
  switch (action.type) {
    case 'MOVE': {
      if (action.from === action.to) return { ...state, dragSrc: null };
      const next = state.cells.map((s) => [...s]) as Cards[];
      const card = next[action.from].pop();
      if (card) {
        card.faceUp = true;
        next[action.to].push(card);
      }
      return { cells: next, dragSrc: null };
    }
    case 'START_DRAG':
      return { ...state, dragSrc: action.src };
    case 'END_DRAG':
      return { ...state, dragSrc: null };
  }
};

const buildInitialCells = (): Cards[] => {
  const cells: Cards[] = Array.from({ length: BOARD_ROWS * BOARD_COLS }, () => []);

  const redStack = ((BOARD_ROWS - 1) * BOARD_COLS) as CellIndex; // row 7 col 1
  const blackStack = (BOARD_COLS - 1) as CellIndex;              // row 1 col 5

  Object.values(RANKS).forEach((rank) => {
    [SUITS.Hearts, SUITS.Diamonds].forEach((suit) =>
      cells[redStack].push({ suit, rank, faceUp: false }),
    );
    [SUITS.Clubs, SUITS.Spades].forEach((suit) =>
      cells[blackStack].push({ suit, rank, faceUp: false }),
    );
  });

  return cells;
};

const useBoard = () => {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    cells: buildInitialCells(),
    dragSrc: null,
  }));

  const startDrag = (src: CellIndex) => dispatch({ type: 'START_DRAG', src });
  const endDrag = () => dispatch({ type: 'END_DRAG' });
  const move = (from: CellIndex, to: CellIndex) =>
    dispatch({ type: 'MOVE', from, to });

  return { ...state, startDrag, endDrag, move };
};

const CardView = ({
  card,
  onPointerDown,
}: {
  card: Card;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
}) => (
  <div
    className={`${styles.card} ${card.faceUp ? '' : styles.back}`}
    style={card.faceUp ? { color: cardColor(card.suit) } : undefined}
    onPointerDown={onPointerDown}
  >
    {card.faceUp ? (
      <>
        <div>{card.rank}</div>
        <div>{card.suit}</div>
      </>
    ) : (
      <span>🂠</span>
    )}
  </div>
);

const Cell = ({
  idx,
  stack,
  isDragging,
  dragSrc,
  handlePointerDown,
}: {
  idx: CellIndex;
  stack: Cards;
  isDragging: boolean;
  dragSrc: CellIndex | null;
  handlePointerDown: (e: ReactPointerEvent<HTMLElement>, idx: CellIndex) => void;
}) => {
  const top = stack.at(-1);
  const belowTop = stack.at(-2);

  return (
    <div data-cell={idx} className={styles.cell}>
      {top && (
        <CardView card={top} onPointerDown={(e) => handlePointerDown(e, idx)} />
      )}
      {belowTop && isDragging && dragSrc === idx && (
        <CardView
          card={belowTop}
          onPointerDown={(e) => handlePointerDown(e, idx)}
        />
      )}
    </div>
  );
};

const Score = () => (
  <div className={styles.score}>
    <span>Player&nbsp;1 Score: 0</span>
    <span>Player&nbsp;2 Score: 0</span>
  </div>
);

export default function Home() {
  const { cells, dragSrc, move, startDrag, endDrag } = useBoard();
  const drag = useSnapDrag(move);

  useEffect(() => {
    document.addEventListener('pointerup', endDrag);
    return () => document.removeEventListener('pointerup', endDrag);
  }, [endDrag]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, idx: CellIndex) => {
      startDrag(idx);
      drag.down(e, idx);
    },
    [drag, startDrag],
  );

  const isDragging = dragSrc !== null;

  return (
    <>
      <Score />

      <div className={styles.board}>
        {cells.map((stack, i) => (
          <Cell
            key={i}
            idx={i as CellIndex}
            stack={stack}
            isDragging={isDragging}
            dragSrc={dragSrc}
            handlePointerDown={handlePointerDown}
          />
        ))}
      </div>
    </>
  );
}
