// components/Board.tsx
'use client';

import { useState } from 'react';
import { BoardDimension, Card as CardType, SUITS, RANKS } from '../types';
import { Cell } from './Cell';
import { useSnapDrag } from '../useSnapDrag';
import styles from '../page.module.css';

export function Board({ num_rows, num_cols }: { num_rows: BoardDimension; num_cols: BoardDimension }) {
    const [cells, setCells] = useState<CardType[][]>(() =>
        Array.from({ length: num_rows * num_cols }, (_, i) =>
            i === 0 ? [{ suit: SUITS.Spades, rank: RANKS.Ace }] : []
        ),
    );

    const moveCard = (from: number, to: number) =>
        setCells(prev => {
            const next = prev.map(s => [...s]);
            const card = next[from].pop();
            if (card) next[to].push(card);
            return next;
        });

    const drag = useSnapDrag(moveCard);

    return (
        <>
            <div className={styles.scoreRow}>
                <span>Player&nbsp;1 Score: 0</span>
                <span>Player&nbsp;2 Score: 0</span>
            </div>

            <div
                className={styles.board}
                onPointerMove={drag.move}
                onPointerUp={drag.up}
            >
                {cells.map((stack, i) => (
                    <div key={i} data-cell={i}>
                        <Cell
                            index={i}
                            cards={stack}
                            onPointerDown={e => drag.down(e as React.PointerEvent<HTMLElement>, i)}
                        />
                    </div>
                ))}
            </div>
        </>
    );
}
