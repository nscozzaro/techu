'use client';

import React, {
  useState,
  PointerEvent as Ptr,
  useEffect,
  useRef,
  useCallback,
  useMemo,
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
  BOARD_ROWS,
  BOARD_COLS,
} from './lib';

/* ──────────────────────────
 ▍Intro / splash component
 ────────────────────────── */
function IntroScreen({ onPlay }: { onPlay: () => void }) {
  /* 3×3 grid top row black, blank middle, bottom red */
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
          <div key={i} className={`${styles.logoCell} ${cellClass(i)}`} />
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
 ▍Main game board
 ────────────────────────── */
function GameBoard() {
  const {
    cells,
    dragSrc,
    startDrag,
    endDrag,
    move: boardMove,
    swap: boardSwap,
  } = useBoard();

  /* first‑move state */
  const firstRedMove = useRef(true);

  /* indices */
  const RED_HOME_ROW = BOARD_ROWS - 2;
  const RED_HOME_CENTER =
    (RED_HOME_ROW * BOARD_COLS) + Math.floor(BOARD_COLS / 2);

  /* set of hand indices (31‑33) */
  const handSet = useMemo(() => new Set<CellIndex>(RED_DST), []);

  /* wrapper to decide swap vs move */
  const moveCard = useCallback(
    (from: CellIndex, to: CellIndex) => {
      const inHand = handSet.has(from) && handSet.has(to);
      if (inHand) {
        boardSwap(from, to);
        return;
      }

      boardMove(from, to);

      if (firstRedMove.current && to === RED_HOME_CENTER) {
        firstRedMove.current = false;
      }
    },
    [boardMove, boardSwap, handSet, RED_HOME_CENTER],
  );

  /* validity rules */
  const canDrop = useCallback(
    (from: CellIndex, to: CellIndex) => {
      const inHand = handSet.has(from) && handSet.has(to);
      if (inHand) return true;                 // always allow swap
      return firstRedMove.current
        ? to === RED_HOME_CENTER
        : true;
    },
    [handSet, RED_HOME_CENTER],
  );

  const drag = useSnapDrag(moveCard, canDrop);

  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const {
    flights,
    hiddenByCell,
    addFlight,
    completeFlight,
  } = useFlights(cellRefs, moveCard);

  /* Deal exactly once */
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

  /* sync dragSrc with pointer */
  useEffect(() => {
    document.addEventListener('pointerup', endDrag);
    return () => document.removeEventListener('pointerup', endDrag);
  }, [endDrag]);

  const handleDown = (e: Ptr<HTMLElement>, idx: CellIndex) => {
    if (idx === RED_SRC || idx === BLK_SRC) return;
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
            ref={el => { cellRefs.current[idx] = el; }}
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
  return started ? <GameBoard /> : <IntroScreen onPlay={() => setStarted(true)} />;
}
