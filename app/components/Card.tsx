'use client';

import { Card as CardType, SUIT_COLORS } from '../types';
import { cardStyles } from './shared-styles';

interface CardProps {
    card: CardType;
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    hidden?: boolean;
    viewTransitionName?: string;
}

export function Card({
    card,
    draggable = false,
    onDragStart,
    onDragEnd,
    hidden = false,
    viewTransitionName,
}: CardProps) {
    const { suit, rank } = card;
    const color = SUIT_COLORS[suit];

    const cloneForDrag = (e: React.DragEvent) => {
        const src = e.currentTarget as HTMLElement;
        const rect = src.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        const img = src.cloneNode(true) as HTMLElement;
        img.style.position = 'absolute';
        img.style.top = '-1000px';
        img.style.width = `${rect.width}px`;
        img.style.height = `${rect.height}px`;
        document.body.appendChild(img);

        e.dataTransfer.setDragImage(img, offsetX, offsetY);
        requestAnimationFrame(() => document.body.removeChild(img));
    };

    return (
        <div
            draggable={draggable}
            onDragStart={e => {
                cloneForDrag(e);
                onDragStart?.(e);
            }}
            onDragEnd={onDragEnd}
            style={{
                ...cardStyles,
                opacity: hidden ? 0 : 1,
                // assign the shared-element name
                viewTransitionName: viewTransitionName,
            }}
        >
            <div
                style={{
                    color,
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    wordBreak: 'break-word',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    width: '100%',
                }}
            >
                <div>{rank}</div>
                <div>{suit}</div>
            </div>
        </div>
    );
}
