'use client';

import { Card as CardType } from '../types';
import { cellStyles } from './shared-styles';
import { Card } from './Card';

export interface Cell {
    cards: CardType[];
    onDragStart?: (e: React.DragEvent) => void;
}

export function Cell({ cards, onDragStart }: Cell) {
    const topCard = cards[cards.length - 1];

    return (
        <div style={cellStyles}>
            {topCard && (
                <div
                    draggable
                    onDragStart={onDragStart}
                    style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                    }}
                >
                    <Card card={topCard} />
                </div>
            )}
        </div>
    );
} 