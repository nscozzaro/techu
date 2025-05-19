'use client';

import React, { PointerEvent as Ptr, useEffect, useRef } from 'react';
import styles from './page.module.css';
import {
  useBoard,
  useFlights,
  useSnapDrag,
  Cell,
  FlyingCard,
  CellIndex,
  RED_SRC,
  RED_DST,
  BLK_SRC,
  BLK_DST,
  DEAL_DELAY_MS,
} from './lib';


export default function Home() {
  const { cells, dragSrc, startDrag, endDrag, move } = useBoard();
  const drag = useSnapDrag(move);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { flights, hiddenByCell, addFlight, completeFlight } = useFlights(
    cellRefs,
    move,
  );

  /* initial "deal" once on mount */
  useEffect(() => {
    const queue = (src: CellIndex, dsts: CellIndex[]) =>
      dsts.forEach((d, i) =>
        setTimeout(() => addFlight(src, d), i * DEAL_DELAY_MS),
      );
    queue(RED_SRC, RED_DST);
    queue(BLK_SRC, BLK_DST);
  }, [addFlight]);

  useEffect(() => {
    document.addEventListener('pointerup', endDrag);
    return () => document.removeEventListener('pointerup', endDrag);
  }, [endDrag]);

  const handleDown = (e: Ptr<HTMLElement>, idx: CellIndex) => {
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
            ref={el => { cellRefs.current[idx] = el }}
            idx={idx as CellIndex}
            stack={stack}
            hidden={hiddenByCell(idx)}
            dragSrc={dragSrc}
            isDragging={dragSrc !== null}
            onDown={handleDown}
          />
        ))}
      </div>

      {flights.map(f => (
        <FlyingCard
          key={f.id}
          flight={f}
          onFinish={() => completeFlight(f)}
        />
      ))}
    </>
  );
}
