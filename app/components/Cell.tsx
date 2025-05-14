'use client';

import { Card as CardType } from '../types';
import { cellStyles } from './shared-styles';
import { Card } from './Card';

interface CellProps {
    index: number;
    cards: CardType[];
    onDragStart?: (e: React.DragEvent) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    hideTopCard?: boolean;
}

export function Cell({
    index,
    cards,
    onDragStart,
    onDragEnd,
    hideTopCard = false,
}: CellProps) {
    const topCard = cards.at(-1);

    return (
        <div style={cellStyles}>
            {topCard && (
                <Card
                    card={topCard}
                    draggable
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    hidden={hideTopCard}
                    viewTransitionName={`card-${index}`}
                />
            )}
        </div>
    );
}
