import { Card as CardType, SUIT_COLORS } from '../types';
import { cardStyles } from './shared-styles';

interface CardProps {
    card: CardType;
}

export function Card({ card }: CardProps) {
    const { suit, rank } = card;
    const color = SUIT_COLORS[suit];

    return (
        <div style={cardStyles}>
            <div style={{
                color,
                fontSize: '1.2rem',
                fontWeight: 'bold',
                textAlign: 'center',
            }}>
                <div>{rank}</div>
                <div>{suit}</div>
            </div>
        </div>
    );
} 