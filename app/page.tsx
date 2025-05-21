// page.tsx
'use client';

import React, {
  useState,
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
  Flight,
  RED_SRC,
  RED_DST,
  BLK_SRC,
  BLK_DST,
  DEAL_DELAY_MS,
  BOARD_ROWS,
  BOARD_COLS,
  makeBotMove,
  canDrop as canDropCard,
  useHandleDown,
  useHandleClick,
  handleCardMove,
  handleFlightComplete,
} from './lib';

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
        May&nbsp;18&nbsp;2025
        <br />
        v&nbsp;1.0
      </p>
    </div>
  );
}

function GameBoard() {
  const {
    cells,
    dragSrc,
    startDrag,
    endDrag,
    move: boardMove,
    swap: boardSwap,
    reveal: boardReveal,
    deal: boardDeal,
  } = useBoard();

  const firstRedMove = useRef(true);

  const RED_HOME_ROW = BOARD_ROWS - 2;
  const RED_HOME_CENTER =
    (RED_HOME_ROW * BOARD_COLS + Math.floor(BOARD_COLS / 2)) as CellIndex;

  const BLK_HOME_ROW = 1;
  const BLK_HOME_CENTER =
    (BLK_HOME_ROW * BOARD_COLS + Math.floor(BOARD_COLS / 2)) as CellIndex;

  const redHand = useMemo(() => new Set<CellIndex>(RED_DST), []);

  const [highlightCells, setHighlightCells] = useState<Set<CellIndex>>(
    () => new Set(),
  );

  const moveCard = useCallback(
    (from: CellIndex, to: CellIndex) => {
      handleCardMove(from, to, cells, redHand, boardMove, boardSwap);
      setHighlightCells(new Set());
    },
    [boardMove, boardSwap, redHand, cells],
  );

  const canDrop = useCallback(
    (from: CellIndex, to: CellIndex) =>
      canDropCard(from, to, redHand, firstRedMove.current, RED_HOME_CENTER),
    [redHand, RED_HOME_CENTER],
  );

  const drag = useSnapDrag(moveCard, canDrop);

  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  const onFlightComplete = useCallback(
    (from: CellIndex, to: CellIndex) => {
      handleFlightComplete(from, to, boardDeal, moveCard);
    },
    [boardDeal, moveCard]
  );

  const { flights, hiddenByCell, addFlight, completeFlight } = useFlights(
    cellRefs,
    onFlightComplete,
  );

  // pure pointer-down → highlight/drag
  const handleDown = useHandleDown(
    firstRedMove,
    redHand,
    RED_HOME_CENTER,
    BLK_HOME_CENTER,
    boardReveal,
    setHighlightCells,
    startDrag,
    drag
  );

  // pure click → reveal on first move
  const handleClickCell = useHandleClick(
    firstRedMove,
    RED_HOME_CENTER,
    BLK_HOME_CENTER,
    boardReveal,
    setHighlightCells
  );

  // initial deal
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

  // bot play
  const botPlayedRef = useRef(false);
  useEffect(() => {
    if (botPlayedRef.current) return;
    const ready = BLK_DST.every(idx => cells[idx].length > 0);
    if (!ready) return;
    botPlayedRef.current = true;
    const id = setTimeout(() => {
      makeBotMove(cells, addFlight, BLK_DST, BLK_HOME_CENTER);
    }, DEAL_DELAY_MS);
    return () => clearTimeout(id);
  }, [cells, addFlight, BLK_HOME_CENTER]);

  // cleanup pointer-up
  useEffect(() => {
    document.addEventListener('pointerup', endDrag);
    return () => document.removeEventListener('pointerup', endDrag);
  }, [endDrag]);

  useEffect(() => {
    if (dragSrc === null) setHighlightCells(new Set());
  }, [dragSrc]);

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
            ref={el => { cellRefs.current[idx] = el }}
            idx={idx as CellIndex}
            stack={stack}
            hidden={hiddenByCell(idx as CellIndex)}
            dragSrc={dragSrc}
            isDragging={dragSrc !== null}
            highlight={highlightCells.has(idx as CellIndex)}
            onDown={handleDown}
            onClick={handleClickCell}
          />
        ))}
      </div>
      {flights.map((f: Flight) => (
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
