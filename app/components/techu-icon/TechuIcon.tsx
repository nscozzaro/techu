import React from 'react';
import styles from './TechuIcon.module.css';

// Define the type for suits
type Suit = {
  symbol: string;
  color: 'red' | 'black';
};

// Array of suits with corresponding colors
const suits: Suit[] = [
  { symbol: '♥', color: 'red' },
  { symbol: '♦', color: 'red' },
  { symbol: '♠', color: 'black' },
  { symbol: '♣', color: 'black' },
];

export default function TechuIcon() {
  const generateRandomGrid = (): (Suit | null)[] => {
    return Array.from({ length: 25 }, () =>
      Math.random() < 0.7 ? suits[Math.floor(Math.random() * suits.length)] : null
    );
  };

  const randomGrid = generateRandomGrid();

  return (
    <div className={styles.iconContainer}>
      <div className={styles.grid}>
        {randomGrid.map((cell, index) => (
          <div
            key={index}
            className={styles.cell}
            style={{ color: cell?.color || 'transparent' }}
          >
            {cell?.symbol || ''}
          </div>
        ))}
      </div>
    </div>
  );
}
