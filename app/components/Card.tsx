'use client';

import { Card as CardType, SUIT_COLORS } from '../types';
import { cardStyles } from './shared-styles';

interface CardProps {
    card: CardType;
}

export function Card({ card }: CardProps) {
    const { suit, rank } = card;
    const color = SUIT_COLORS[suit];

    return (
        <div
            style={cardStyles}
            onDragStart={(e) => {
                // Create a clone of the card for the drag image
                const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
                dragImage.style.position = 'absolute';
                dragImage.style.top = '-1000px';
                document.body.appendChild(dragImage);
                e.dataTransfer.setDragImage(dragImage, 0, 0);

                // Remove the clone after drag starts
                requestAnimationFrame(() => {
                    document.body.removeChild(dragImage);
                });
            }}
        >
            <div style={{
                color,
                fontSize: '1.1rem',
                fontWeight: 'bold',
                textAlign: 'center',
                wordBreak: 'break-word',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'normal',
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                margin: 0,
            }}>
                <div>{rank}</div>
                <div>{suit}</div>
            </div>
        </div>
    );
} 