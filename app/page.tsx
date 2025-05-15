'use client';

import { useState, useEffect } from 'react';
import {
  /* board + card domain */
  BOARD_ROWS, BOARD_COLS, SUITS, RANKS,
  Card, Cards, cardColor, useSnapDrag, CellIndex,
} from './lib';
import styles from './page.module.css';

/* ──────────────────────────
   ▍Types
   ────────────────────────── */
type BoardCells = Cards[];

/* ──────────────────────────
   ▍Presentation components
   ────────────────────────── */
const CardView = ({
  card,
  onPointerDown,
}: {
  card: Card;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
}) => {
  const faceUp = card.faceUp;
  return (
    <div
      className={`${styles.card} ${faceUp ? '' : styles.back}`}
      style={faceUp ? { color: cardColor(card.suit) } : undefined}
      onPointerDown={onPointerDown}
    >
      {faceUp ? (
        <>
          <div>{card.rank}</div>
          <div>{card.suit}</div>
        </>
      ) : (
        <span>🂠</span>
      )}
    </div>
  );
};

const Cell = ({
  idx,
  cards,
  onPointerDown,
  isDragging,
  dragSourceCell,
}: {
  idx: CellIndex;
  cards: Cards;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  isDragging: boolean;
  dragSourceCell: CellIndex | null;
}) => {
  const topCard = cards.at(-1);
  const nextCard = cards.at(-2);

  return (
    <div data-cell={idx} className={styles.cell}>
      {topCard && (
        <CardView card={topCard} onPointerDown={onPointerDown} />
      )}
      {nextCard && isDragging && dragSourceCell === idx && (
        <CardView card={nextCard} onPointerDown={onPointerDown} />
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

const Board = ({
  cells,
  onPointerDown,
  isDragging,
  dragSourceCell,
}: {
  cells: BoardCells;
  onPointerDown: (e: React.PointerEvent<HTMLElement>, idx: CellIndex) => void;
  isDragging: boolean;
  dragSourceCell: CellIndex | null;
}) => (
  <div className={styles.board}>
    {cells.map((stack, i) => (
      <Cell
        key={i}
        idx={i as CellIndex}
        cards={stack}
        onPointerDown={e => onPointerDown(e, i as CellIndex)}
        isDragging={isDragging}
        dragSourceCell={dragSourceCell}
      />
    ))}
  </div>
);

/* ──────────────────────────
   ▍Initial board state
   ────────────────────────── */
const makeInitialCells = (): BoardCells => {
  const cells: BoardCells = Array.from(
    { length: BOARD_ROWS * BOARD_COLS },
    () => [],
  ) as BoardCells;

  const redCell = ((BOARD_ROWS - 1) * BOARD_COLS) as CellIndex; // row 7 col 1  → idx 30
  const blackCell = (BOARD_COLS - 1) as CellIndex;              // row 1 col 5  → idx 4

  Object.values(RANKS).forEach(rank => {
    [SUITS.Hearts, SUITS.Diamonds].forEach(suit =>
      cells[redCell].push({ suit, rank, faceUp: false }),
    );
    [SUITS.Clubs, SUITS.Spades].forEach(suit =>
      cells[blackCell].push({ suit, rank, faceUp: false }),
    );
  });

  return cells;
};

/* ──────────────────────────
   ▍Main page
   ────────────────────────── */
export default function Home() {
  const [cells, setCells] = useState<BoardCells>(makeInitialCells());
  const [isDragging, setIsDragging] = useState(false);
  const [dragSourceCell, setDragSourceCell] = useState<CellIndex | null>(null);

  const moveCard = (from: CellIndex, to: CellIndex) =>
    setCells(prev => {
      const next = prev.map(s => [...s]) as BoardCells;
      const c = next[from].pop();
      if (c) {
        c.faceUp = true;      // flip on drop
        next[to].push(c);
      }
      return next;
    });

  const drag = useSnapDrag(moveCard);

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>, idx: CellIndex) => {
    setIsDragging(true);
    setDragSourceCell(idx);
    drag.down(e, idx);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    setDragSourceCell(null);
  };

  useEffect(() => {
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  return (
    <>
      <Score />
      <Board
        cells={cells}
        onPointerDown={handlePointerDown}
        isDragging={isDragging}
        dragSourceCell={dragSourceCell}
      />
    </>
  );
}
