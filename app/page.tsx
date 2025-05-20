// page.tsx
'use client';

import React, {
  useState,
  PointerEvent as Ptr,
  useEffect,
  useRef,
} from 'react';
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

/* ──────────────────────────
 ▍Intro / splash component
 ────────────────────────── */
function IntroScreen({ onPlay }: { onPlay: () => void }) {
  const squares = Array.from({ length: 9 });
  const cellClass = (i: number) => {
    const row = Math.floor(i / 3);
    if (row === 0) return styles.logoBlack;
    if (row === 2) return styles.logoRed;
    return '';
  };

  return (
    <div className={styles.intro}>
      <div className={styles.logoGrid}>
        {squares.map((_, i) => (
          <div
            key={i}
            className={`${styles.logoCell} ${cellClass(i)}`}
          />
        ))}
      </div>

      <h1 className={styles.introTitle}>
        <span className={styles.katakana}>テ</span>
        <span className={styles.latin}>ECHU</span>
      </h1>

      <p className={styles.introSub}>
        Red&nbsp;vs&nbsp;black.
        <br />
        Most covered spaces wins.
      </p>

      <button className={styles.playBtn} onClick={onPlay}>
        Begin
      </button>

      <p className={styles.meta}>
        May&nbsp;18&nbsp;2025<br />v&nbsp;1.0
      </p>
    </div>
  );
}

/* ──────────────────────────
 ▍Main game board & root
 ────────────────────────── */
function GameBoard() {
  const { cells, dragSrc, startDrag, endDrag, move } = useBoard();
  const drag = useSnapDrag(move);

  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { flights, hiddenByCell, addFlight, completeFlight } = useFlights(
    cellRefs,
    move,
  );

  /* ╔════════════════════════════════════════════════════╗
     ║  Deal *exactly once* – even under Strict‑Mode      ║
     ╚════════════════════════════════════════════════════╝ */
  const dealtRef = useRef(false);
  useEffect(() => {
    if (dealtRef.current) return;
    dealtRef.current = true;

    const queue = (src: CellIndex, dsts: CellIndex[]) =>
      dsts.forEach((d, i) =>
        setTimeout(() => addFlight(src, d), i * DEAL_DELAY_MS),
      );

    queue(RED_SRC, RED_DST);
    queue(BLK_SRC, BLK_DST);
  }, [addFlight]);

  /* keep drag‑source in sync with global pointer‑up */
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
        <span>Player&nbsp;1&nbsp;Score:&nbsp;0</span>
        <span>Player&nbsp;2&nbsp;Score:&nbsp;0</span>
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

export default function Home() {
  const [started, setStarted] = useState(false);
  return started ? (
    <GameBoard />
  ) : (
    <IntroScreen onPlay={() => setStarted(true)} />
  );
}
