// components/Board.tsx
'use client';

import { useState } from 'react';
import { BoardDimension, Card as CardType, SUITS, RANKS } from '../types';
import { Cell } from './Cell';
import styles from '../page.module.css';

interface BoardProps {
    num_rows: BoardDimension;
    num_cols: BoardDimension;
}

export function Board({ num_rows, num_cols }: BoardProps) {
    // initialize each cell; only cell 0 gets an Ace to start
    const [cells, setCells] = useState<CardType[][]>(() =>
        Array.from({ length: num_rows * num_cols }, (_, i) =>
            i === 0 ? [{ suit: SUITS.Spades, rank: RANKS.Ace }] : []
        )
    );

    // which cell is currently hidden because its card is mid-drag
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

    const handleDragStart = (e: React.DragEvent, source: number) => {
        e.dataTransfer.setData('text/plain', source.toString());
        e.dataTransfer.effectAllowed = 'move';
        setDraggingIndex(source);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        e.preventDefault();
        setDraggingIndex(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, target: number) => {
        e.preventDefault();
        const source = parseInt(e.dataTransfer.getData('text/plain'), 10);

        if (source !== target) {
            setCells(prev => {
                const next = prev.map(stack => [...stack]);
                const card = next[source].pop();
                if (card) next[target].push(card);
                return next;
            });
        }
        setDraggingIndex(null);
    };

    return (
        <>
            <div className={styles.scoreRow}>
                <span>Player&nbsp;1 Score: 0</span>
                <span>Player&nbsp;2 Score: 0</span>
            </div>

            <div className={styles.board}>
                {cells.map((stack, i) => (
                    <div
                        key={i}
                        onDragOver={handleDragOver}
                        onDrop={e => handleDrop(e, i)}
                    >
                        <Cell
                            index={i}
                            cards={stack}
                            onDragStart={e => handleDragStart(e, i)}
                            onDragEnd={handleDragEnd}
                            hideTopCard={draggingIndex === i}
                        />
                    </div>
                ))}
            </div>
        </>
    );
}
