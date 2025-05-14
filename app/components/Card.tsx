'use client';
import { Card as CardType, SUIT_COLORS } from '../types';
import { cardStyles } from './shared-styles';

export function Card({
    card,
    onPointerDown,
}: {
    card: CardType;
    onPointerDown: (e: React.PointerEvent) => void;
}) {
    const { suit, rank } = card;
    return (
        <div
            style={cardStyles}
            onPointerDown={onPointerDown}
            aria-grabbed="false"
        >
            <div style={{ color: SUIT_COLORS[suit], textAlign: 'center' }}>
                <div>{rank}</div>
                <div>{suit}</div>
            </div>
        </div>
    );
}