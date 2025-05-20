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
  makeBotMove,
} from './lib';

/* ──────────────────────────
 ▍Intro / splash component
 ────────────────────────── */
function IntroScreen({ onPlay }: { onPlay: () => void }) {
  /* 3×3 grid – top row black, blank middle, bottom red */
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

  /* first‑move state (red only) */
  const firstRedMove = useRef(true);

  /* row / column helpers */
  const RED_HOME_ROW = BOARD_ROWS - 2;
  const RED_HOME_CENTER =
    RED_HOME_ROW * BOARD_COLS + Math.floor(BOARD_COLS / 2);

  const BLK_HOME_ROW = 1;
  const BLK_HOME_CENTER =
    BLK_HOME_ROW * BOARD_COLS + Math.floor(BOARD_COLS / 2);

  /* sets of "hand" cells */
  const redHand = useMemo(() => new Set<CellIndex>(RED_DST), []);

  /* wrapper deciding swap vs move */
  const moveCard = useCallback(
    (from: CellIndex, to: CellIndex) => {
      const fromInRedHand = redHand.has(from);
      const toInRedHand = redHand.has(to);

      /* hand‑to‑hand swap for RED only (black hand is bot‑controlled) */
      if (fromInRedHand && toInRedHand) {
        boardSwap(from, to);
        return;
      }

      boardMove(from, to);

      /* record that red's first move has occurred */
      if (firstRedMove.current && to === RED_HOME_CENTER) {
        firstRedMove.current = false;
      }
    },
    [boardMove, boardSwap, redHand, RED_HOME_CENTER],
  );

  /* pointer‑drag rules */
  const canDrop = useCallback(
    (from: CellIndex, to: CellIndex) => {
      const inRedHand = redHand.has(from) && redHand.has(to);
      if (inRedHand) return true; // always allow swap within red hand
      return firstRedMove.current ? to === RED_HOME_CENTER : true;
    },
    [redHand, RED_HOME_CENTER],
  );

  const drag = useSnapDrag(moveCard, canDrop);

  /* flight helpers */
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const {
    flights,
    hiddenByCell,
    addFlight,
    completeFlight,
  } = useFlights(cellRefs, moveCard);

  /* ───── initial deal (fires once) ───── */
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

  /* ───── auto‑play bot move (black) ───── */
  const botPlayedRef = useRef(false);
  useEffect(() => {
    if (botPlayedRef.current) return;

    /* have all three black hand cards arrived? */
    const handReady = BLK_DST.every(idx => cells[idx].length > 0);
    if (!handReady) return;

    botPlayedRef.current = true;

    /* schedule bot play after the same delay as a human turn */
    const id = setTimeout(() => {
      makeBotMove(cells, addFlight, BLK_DST, BLK_HOME_CENTER as CellIndex);
    }, DEAL_DELAY_MS);

    return () => clearTimeout(id);
  }, [cells, addFlight, BLK_HOME_CENTER]);

  /* ───── keep dragSrc in sync with pointer‑up anywhere ───── */
  useEffect(() => {
    document.addEventListener('pointerup', endDrag);
    return () => document.removeEventListener('pointerup', endDrag);
  }, [endDrag]);

  const handleDown = (e: Ptr<HTMLElement>, idx: CellIndex) => {
    /* decks are not draggable */
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
