'use client';

import { useState } from 'react';
import {
  BOARD_ROWS, BOARD_COLS, SUITS, RANKS,
  Card, Cards, cardColor, useSnapDrag,
} from './lib';
import styles from './page.module.css';

/* ──────────────────────────
   ▍Presentation components
   ────────────────────────── */
const CardView = ({ card, onPointerDown }: {
  card: Card; onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
}) => (
  <div
    className={styles.card}
    style={{ color: cardColor(card.suit) }}
    onPointerDown={onPointerDown}
  >
    <div>{card.rank}</div>
    <div>{card.suit}</div>
  </div>
);

const Cell = ({ idx, cards, onPointerDown }: {
  idx: number; cards: Cards;
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

const Board = ({ cells, onPointerDown }: {
  cells: Cards[]; onPointerDown: (e: React.PointerEvent<HTMLElement>, idx: number) => void;
}) => (
  <div className={styles.board}>
    {cells.map((stack, i) => (
      <Cell
        key={i}
        idx={i}
        cards={stack}
        onPointerDown={e => onPointerDown(e, i)}
      />
    ))}
  </div>
);

/* ──────────────────────────
   ▍Main page
   ────────────────────────── */
const makeInitialCells = (): Cards[] =>
  Array.from({ length: BOARD_ROWS * BOARD_COLS }, (_, i) =>
    i === 0 ? [{ suit: SUITS.Spades, rank: RANKS.Ace }] : [],
  );

export default function Home() {
  const [cells, setCells] = useState<Cards[]>(makeInitialCells());

  const moveCard = (from: number, to: number) =>
    setCells(prev => {
      const next = prev.map(s => [...s]);
      const c = next[from].pop();
      if (c) next[to].push(c);
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
