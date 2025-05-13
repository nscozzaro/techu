import { Card } from '../types';

export interface Cell {
    cards: Card[];
}

export function Cell({ cards }: Cell) {
    return (
        <div
            style={{
                background: '#222',
                border: '2px solid #444',
                borderRadius: '10px',
                boxShadow: '0 2px 8px #0004',
                aspectRatio: '7 / 10',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        />
    );
} 