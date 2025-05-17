'use client';

import React, { forwardRef, PointerEvent as Ptr, useEffect, useReducer, useRef } from 'react';
import styles from './page.module.css';
import {
  BOARD_ROWS, BOARD_COLS, SUITS, RANKS,
  useSnapDrag, cardColor,
  CellIndex, Card, Cards, reducer as boardReducer,
  RED_SRC, RED_DST, BLK_SRC, BLK_DST, DEAL_DELAY_MS,
} from './lib';

/* ────────────────────────────
   Build the starting deck piles
   ──────────────────────────── */
function makeStartingCells(): Cards[] {
  const cells = Array.from({ length: BOARD_ROWS * BOARD_COLS }, () => [] as Cards);
  const push = (cell: CellIndex, suit: keyof typeof SUITS, rank: keyof typeof RANKS) =>
    cells[cell].push({ suit: SUITS[suit], rank: RANKS[rank], faceUp: false });

  Object.values(RANKS).forEach(r => {
    ([SUITS.Hearts, SUITS.Diamonds]).forEach(s => push(RED_SRC, s, r));
    ([SUITS.Clubs, SUITS.Spades]).forEach(s => push(BLK_SRC, s, r));
  });
  return cells;
}

/* ────────────────────────────
   Board state (easy to port to Redux)
   ──────────────────────────── */
function useBoard() {
  const [state, dispatch] = useReducer(boardReducer, undefined, () => ({
    cells: makeStartingCells(),
    dragSrc: null,
  }));
  return {
    ...state,
    startDrag: (src: CellIndex) => dispatch({ type: 'START_DRAG', src }),
    endDrag: () => dispatch({ type: 'END_DRAG' }),
    moveCard: (from: CellIndex, to: CellIndex) =>
      dispatch({ type: 'MOVE', from, to }),
  };
}

/* ────────────────────────────
   In‑flight animation reducer
   ──────────────────────────── */
type Flight = {
  id: string;
  src: CellIndex;
  dst: CellIndex;
  start: DOMRect;
  end: DOMRect;
};
type Flights = Flight[];
type FlightAction =
  | { type: 'ADD'; payload: Flight }
  | { type: 'REMOVE'; id: string };

function flightsReducer(list: Flights, action: FlightAction): Flights {
  return action.type === 'ADD'
    ? [...list, action.payload]
    : list.filter(f => f.id !== action.id);
}

/* ────────────────────────────
   Presentational bits
   ──────────────────────────── */
const CardView = ({ card, onDown }: { card: Card; onDown: (e: Ptr<HTMLElement>) => void }) => (
  <div
    className={`${styles.card} ${card.faceUp ? '' : styles.back}`}
    style={card.faceUp ? { color: cardColor(card.suit) } : undefined}
    onPointerDown={onDown}
  >
    {card.faceUp
      ? (<><div>{card.rank}</div><div>{card.suit}</div></>)
      : <span>🂠</span>}
  </div>
);

type CellProps = {
  idx: CellIndex;
  stack: Cards;
  hidden: number;
  dragSrc: CellIndex | null;
  isDragging: boolean;
  onDown: (e: Ptr<HTMLElement>, idx: CellIndex) => void;
};
const Cell = forwardRef<HTMLDivElement, CellProps>((p, ref) => {
  const top = p.stack[p.stack.length - 1 - p.hidden];
  const second = p.stack[p.stack.length - 2 - p.hidden];
  return (
    <div ref={ref} data-cell={p.idx} className={styles.cell}>
      {top && <CardView card={top} onDown={e => p.onDown(e, p.idx)} />}
      {second && p.isDragging && p.dragSrc === p.idx &&
        <CardView card={second} onDown={e => p.onDown(e, p.idx)} />}
    </div>
  );
});
Cell.displayName = 'Cell';

/* Overlay that flies from A → B and notifies on completion */
function FlyingCard({ flight, onFinish }: { flight: Flight; onFinish: () => void }) {
  const [style, setStyle] = React.useState(() => ({
    position: 'fixed' as const,
    left: flight.start.left,
    top: flight.start.top,
    width: flight.start.width,
    height: flight.start.height,
  }));
  /* trigger the move on the next frame */
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setStyle(s => ({ ...s, left: flight.end.left, top: flight.end.top })),
    );
    return () => cancelAnimationFrame(id);
  }, [flight.end]);
  return (
    <div
      className={`${styles.card} ${styles.back} ${styles.flying}`}
      style={style}
      onTransitionEnd={onFinish}
    ><span>🂠</span></div>
  );
}

/* ────────────────────────────
   Main component
   ──────────────────────────── */
export default function Home() {
  /* board logic */
  const { cells, dragSrc, startDrag, endDrag, moveCard } = useBoard();
  const drag = useSnapDrag(moveCard);

  /* refs to each cell, used when launching an animation */
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* animation state */
  const [flights, dispatchFlights] = useReducer(flightsReducer, []);

  /* quick helper: how many cards are "hidden" in this cell because they're flying away? */
  const hiddenFor = (idx: number) => flights.filter(f => f.src === idx).length;

  /* helper to create and start a flight */
  function launch(src: CellIndex, dst: CellIndex) {
    const from = cellRefs.current[src];
    const to = cellRefs.current[dst];
    if (!from || !to) return;
    dispatchFlights({
      type: 'ADD',
      payload: {
        id: Math.random().toString(36).slice(2),
        src, dst,
        start: from.getBoundingClientRect(),
        end: to.getBoundingClientRect(),
      },
    });
  }

  /* one‑off: deal six cards on mount */
  useEffect(() => {
    const queue = (src: CellIndex, dsts: CellIndex[]) =>
      dsts.forEach((d, i) => setTimeout(() => launch(src, d), i * DEAL_DELAY_MS));
    queue(RED_SRC, RED_DST);
    queue(BLK_SRC, BLK_DST);
  }, []);

  /* let the board know when the user stops dragging */
  useEffect(() => {
    document.addEventListener('pointerup', endDrag);
    return () => document.removeEventListener('pointerup', endDrag);
  }, [endDrag]);

  /* pointer‑down from user */
  function handlePointerDown(e: Ptr<HTMLElement>, idx: CellIndex) {
    startDrag(idx);
    drag.down(e, idx);
  }

  return (
    <>
      <div className={styles.score}>
        <span>Player&nbsp;1 Score: 0</span>
        <span>Player&nbsp;2 Score: 0</span>
      </div>

      <div className={styles.board}>
        {cells.map((stack, i) => (
          <Cell
            key={i}
            ref={el => { cellRefs.current[i] = el; }}
            idx={i as CellIndex}
            stack={stack}
            hidden={hiddenFor(i)}
            dragSrc={dragSrc}
            isDragging={dragSrc !== null}
            onDown={handlePointerDown}
          />
        ))}
      </div>

      {flights.map(f => (
        <FlyingCard
          key={f.id}
          flight={f}
          onFinish={() => {
            moveCard(f.src, f.dst);                    // update board
            dispatchFlights({ type: 'REMOVE', id: f.id }); // clear flight
          }}
        />
      ))}
    </>
  );
}
