'use client';

import { BoardDimension, Card as CardType, SUITS, RANKS } from '../types';
import { Cell } from './Cell';
import styles from '../page.module.css';
import { useState } from 'react';

interface BoardProps {
    num_rows: BoardDimension;
    num_cols: BoardDimension;
}

export function Board({ num_rows, num_cols }: BoardProps) {
    const [cells, setCells] = useState<CardType[][]>(() => {
        const initialCells = Array(num_rows * num_cols).fill([]);
        initialCells[0] = [{ suit: SUITS.Spades, rank: RANKS.Ace }];
        return initialCells;
    });

    const handleDragStart = (e: React.DragEvent, cellIndex: number) => {
        e.dataTransfer.setData('text/plain', cellIndex.toString());
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent, targetCellIndex: number) => {
        e.preventDefault();
        const sourceCellIndex = parseInt(e.dataTransfer.getData('text/plain'));

        setCells(prevCells => {
            const newCells = [...prevCells];
            const sourceCards = [...newCells[sourceCellIndex]];
            const card = sourceCards.pop();
            if (card) {
                newCells[sourceCellIndex] = sourceCards;
                newCells[targetCellIndex] = [...newCells[targetCellIndex], card];
            }
            return newCells;
        });
    };

    return (
        <>
            <div className={styles.scoreRow}>
                <span>Player 1 Score: 0</span>
                <span>Player 2 Score: 0</span>
            </div>
            <div className={styles.board}>
                {cells.map((cellCards, i) => (
                    <div
                        key={i}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, i)}
                    >
                        <Cell
                            cards={cellCards}
                            onDragStart={(e) => handleDragStart(e, i)}
                        />
                    </div>
                ))}
            </div>
        </>
    );
}                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   