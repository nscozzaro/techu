import React from 'react';
import styles from '/styles/TechuIcon.module.css';

// Array of suits with corresponding colors
const suits = [
  { symbol: '♥', color: 'red' },
  { symbol: '♦', color: 'red' },
  { symbol: '♠', color: 'black' },
  { symbol: '♣', color: 'black' },
];

export default function TechuIcon() {
  // Generate a 5x5 randomized grid
  const generateRandomGrid = () => {
    const grid = Array.from({ length: 25 }, () => {
      Math.random() < 0.7 ? suits[Math.floor(Math.random() * suits.length)] : null;
    });
    return grid;
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
