'use client';

import React, {
  PointerEvent as Ptr,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import styles from './page.module.css';
import {
  /* board + types */
  CellIndex,
  reducer as boardReducer,
  makeStartingCells,
  /* DnD + helpers */
  useSnapDrag,
  /* flights */
  Flight,
  Flights,
  flightsReducer,
  /* cells & cards */
  Cell,
  FlyingCard,
  /* deal constants */
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
    moveCard: (from: CellIndex, to: CellIndex) =>
      dispatch({ type: 'MOVE', from, to }),
  };
}

/* ──────────────────────────
   Main component
   ────────────────────────── */
export default function Home() {
  /* board + drag */
  const { cells, dragSrc, startDrag, endDrag, moveCard } = useBoard();
  const drag = useSnapDrag(moveCard);

  /* refs to each cell element */
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* flight state */
  const [flights, dispatchFlights] = useReducer(flightsReducer, [] as Flights);

  /* helper: how many cards currently "flying" out of a given stack */
  const hiddenFor = (idx: number) => flights.filter(f => f.src === idx).length;

  /* launch an individual flight */
  function launch(src: CellIndex, dst: CellIndex) {
    const from = cellRefs.current[src];
    const to = cellRefs.current[dst];
    if (!from || !to) return; // safety check for impossible path
    dispatchFlights({
      type: 'ADD',
      payload: {
        id: Math.random().toString(36).slice(2),
        src,
        dst,
        start: from.getBoundingClientRect(),
        end: to.getBoundingClientRect(),
      },
    });
  }

  /* apply card move + remove flight once animation ends */
  function handleFlightFinish(flight: Flight) {
    moveCard(flight.src, flight.dst);
    dispatchFlights({ type: 'REMOVE', id: flight.id });
  }

  /* initial "deal" */
  useEffect(() => {
    const queue = (src: CellIndex, dsts: CellIndex[]) =>
      dsts.forEach((d, i) => setTimeout(() => launch(src, d), i * DEAL_DELAY_MS));
    queue(RED_SRC, RED_DST);
    queue(BLK_SRC, BLK_DST);
  }, []);

  /* end drag globally */
  useEffect(() => {
    document.addEventListener('pointerup', endDrag);
    return () => document.removeEventListener('pointerup', endDrag);
  }, [endDrag]);

  /* pointer‑down handler for cards */
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
          onFinish={() => handleFlightFinish(f)}
        />
      ))}
    </>
  );
}
