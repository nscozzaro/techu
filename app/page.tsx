'use client';

import { useState } from 'react';
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
}: {
  idx: CellIndex;
  cards: Cards;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
}) => (
  <div data-cell={idx} className={styles.cell}>
    {cards.at(-1) && (
      <CardView card={cards.at(-1)!} onPointerDown={onPointerDown} />
    )}
  </div>
);

const Score = () => (
  <div className={styles.score}>
    <span>Player&nbsp;1 Score: 0</span>
    <span>Player&nbsp;2 Score: 0</span>
  </div>
);

const Board = ({
  cells,
  onPointerDown,
}: {
  cells: BoardCells;
  onPointerDown: (e: React.PointerEvent<HTMLElement>, idx: CellIndex) => void;
}) => (
  <div className={styles.board}>
    {cells.map((stack, i) => (
      <Cell
        key={i}
        idx={i as CellIndex}
        cards={stack}
        onPointerDown={e => onPointerDown(e, i as CellIndex)}
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

  return (
    <>
      <Score />
      <Board cells={cells} onPointerDown={drag.down} />
    </>
  );
}
