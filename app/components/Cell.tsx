'use client';
import { Card as CardType } from '../types';
import { cellStyles } from './shared-styles';
import { Card } from './Card';

export const Cell = ({
    index,
    cards,
    onPointerDown,
}: {
    index: number;
    cards: CardType[];
    onPointerDown: (e: React.PointerEvent) => void;
}) => {
    const top = cards.at(-1);
    return (
        <div style={cellStyles}>
            {top && <Card card={top} onPointerDown={onPointerDown} />}
        </div>
    );
};