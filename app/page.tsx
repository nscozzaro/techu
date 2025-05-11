import styles from './page.module.css';
import { Board } from './types';

const cells = Board.new().getCells().flat();

export default function Home() {
  return (
    <>
      <div className={styles.scoreRow}>
        <span>Player 1 Score: 0</span>
        <span>Player 2 Score: 0</span>
      </div>
      <div className={styles.board}>
        {cells.map((_, i) => (
          <div key={i} className={styles.cell} />
        ))}
      </div>
    </>
  );
}
