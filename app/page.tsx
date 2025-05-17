// app/page.tsx

'use client';

import React, {
  PointerEvent as Ptr,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import styles from './page.module.css';
import {
  CellIndex,
  reducer as boardReducer,
  makeStartingCells,
  useSnapDrag,
  Flight,
  Flights,
  flightsReducer,
  Cell,
  FlyingCard,
  RED_SRC,
  RED_DST,
  BLK_SRC,
  BLK_DST,
  DEAL_DELAY_MS,
} from './lib';

/* ──────────────────────────
   Board state hook
   ────────────────────────── */
function useBoard() {
  const [state, dispatch] = useReducer(boardReducer, undefined, () => ({
    cells: makeStartingCells(),
    dragSrc: null,
  }));

  return {
    ...state,
    startDrag: (src: CellIndex) => dispatch({ type: 'START_DRAG', src }),
    endDrag: () => dispatch({ type: 'END_DRAG' }),
    move: (from: CellIndex, to: CellIndex) =>
      dispatch({ type: 'MOVE', from, to }),
  };
}

/* ──────────────────────────
   Flight-animation hook
   ────────────────────────── */
function useFlights(
  cellRefs: React.MutableRefObject<(HTMLDivElement | null)[]>,
  moveCard: (from: CellIndex, to: CellIndex) => void,
) {
  const [flights, dispatch] = useReducer(flightsReducer, [] as Flights);

  const hiddenByCell = (idx: number) =>
    flights.filter(f => f.src === idx).length;

  const addFlight = (src: CellIndex, dst: CellIndex) => {
    const fromEl = cellRefs.current[src];
    const toEl = cellRefs.current[dst];
    if (!fromEl || !toEl) return;

    dispatch({
      type: 'ADD',
      payload: {
        id: Math.random().toString(36).slice(2),
        src,
        dst,
        start: fromEl.getBoundingClientRect(),
        end: toEl.getBoundingClientRect(),
      },
    });
  };

  const completeFlight = (flight: Flight) => {
    moveCard(flight.src, flight.dst);
    dispatch({ type: 'REMOVE', id: flight.id });
  };

  return { flights, hiddenByCell, addFlight, completeFlight };
}

/* ──────────────────────────
   Main component
   ────────────────────────── */
export default function Home() {
  const {
    cells,
    dragSrc,
    startDrag,
    endDrag,
    move: moveCard,
  } = useBoard();

  const drag = useSnapDrag(moveCard);

  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { flights, hiddenByCell, addFlight, completeFlight } = useFlights(
    cellRefs,
    moveCard,
  );

  /* initial deal — run only once on mount */
  useEffect(() => {
    const queue = (src: CellIndex, dsts: CellIndex[]) =>
      dsts.forEach((d, i) =>
        setTimeout(() => addFlight(src, d), i * DEAL_DELAY_MS)
      );

    queue(RED_SRC, RED_DST);
    queue(BLK_SRC, BLK_DST);
  }, []); // ← add empty dependency array to prevent reruns

  /* end any drag on global pointer up */
  useEffect(() => {
    document.addEventListener('pointerup', endDrag);
    return () => document.removeEventListener('pointerup', endDrag);
  }, [endDrag]);

  /* start a drag on pointer down */
  const handlePointerDown = (e: Ptr<HTMLElement>, idx: CellIndex) => {
    startDrag(idx);
    drag.down(e, idx);
  };

  return (
    <>
      <div className={styles.score}>
        <span>Player&nbsp;1 Score: 0</span>
        <span>Player&nbsp;2 Score: 0</span>
      </div>

      <div className={styles.board}>
        {cells.map((stack, idx) => (
          <Cell
            key={idx}
            ref={el => {
              cellRefs.current[idx] = el;
            }}
            idx={idx as CellIndex}
            stack={stack}
            hidden={hiddenByCell(idx)}
            dragSrc={dragSrc}
            isDragging={dragSrc !== null}
            onDown={handlePointerDown}
          />
        ))}
      </div>

      {flights.map(flight => (
        <FlyingCard
          key={flight.id}
          flight={flight}
          onFinish={() => completeFlight(flight)}
        />
      ))}
    </>
  );
}
