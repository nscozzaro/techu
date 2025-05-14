// app/page.tsx
'use client';

import { useState } from 'react';
import { SUITS, RANKS, BoardDimension, Card as CardT } from './types';
import { useSnapDrag } from './useSnapDrag';
import styles from './page.module.css';

const Card = ({
  card,
  onPointerDown,
}: { card: CardT; onPointerDown: (e: React.PointerEvent) => void }) => (
  <div
    className={styles.card}
    style={{ color: card.suit === SUITS.Hearts || card.suit === SUITS.Diamonds ? 'red' : 'black' }}
    onPointerDown={onPointerDown}
  >
    <div>{card.rank}</div>
    <div>{card.suit}</div>
  </div>
);

const Cell = ({
  idx,
  cards,
  onPointerDown,
}: {
  idx: number;
  cards: CardT[];
  onPointerDown: (e: React.PointerEvent) => void;
}) => (
  <div data-cell={idx} className={styles.cell}>
    {cards.at(-1) && <Card card={cards.at(-1)!} onPointerDown={onPointerDown} />}
  </div>
);

const BOARD_ROWS = 7 as BoardDimension;
const BOARD_COLS = 5 as BoardDimension;
const total = BOARD_ROWS * BOARD_COLS;

export default function Home() {
  const [cells, setCells] = useState<CardT[][]>(
    Array.from({ length: total }, (_, i) =>
      i === 0 ? [{ suit: SUITS.Spades, rank: RANKS.Ace }] : [],
    ),
  );

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
      <div className={styles.score}>
        <span>Player&nbsp;1 Score: 0</span>
        <span>Player&nbsp;2 Score: 0</span>
      </div>

      <div className={styles.board}>
        {cells.map((stack, i) => (
          <Cell key={i} idx={i} cards={stack} onPointerDown={e => drag.down(e as React.PointerEvent<HTMLElement>, i)} />
        ))}
      </div>
    </>
  );
}
