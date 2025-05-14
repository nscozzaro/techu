import { Card as CardType } from '../types';
import { cellStyles } from './shared-styles';
import { Card } from './Card';

export interface Cell {
    cards: CardType[];
}

export function Cell({ cards }: Cell) {
    const topCard = cards[cards.length - 1];

    return (
        <div style={cellStyles}>
            {topCard && <Card card={topCard} />}
        </div>
    );
} 