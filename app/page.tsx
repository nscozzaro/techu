import Link from 'next/link'
import React from 'react';
import styles from './page.module.css';
import TechuIcon from './components/techu-icon/TechuIcon';

export default function Page() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.iconContainer}>
          <TechuIcon/>
        </div>
        <h1 className={styles.title}>Techu</h1>
        <p className={styles.description}>
        Cover more spaces than your opponent.
        </p>
      </header>
      <main className={styles.main}>
        <Link className={styles.playButton} href="/game">Play</Link>
        <footer className={styles.footer}>
          <p>November 30, 2024</p>
          <p>No. 1260</p>
        </footer>
      </main>
    </div>
  );
}
