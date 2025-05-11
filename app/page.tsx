// page.tsx
import styles from './page.module.css'
import { Board } from './types'

const board = Board.new()
// flatten into 35 cells
const cells = board.getCells().flat()

export default function Home() {
  return (
    <div className={styles.outerContainer}>
      <div className={styles.scoreRow}>
        <span>Player 1 Score: 0</span>
        <span>Player 2 Score: 0</span>
      </div>

      {/* a single wrapper that clamps to the biggest 5∶7 box fitting your screen */}
      <div className={styles.boardAspectWrapper}>
        <div className={styles.centralBoardContainer}>
          <div className={styles.fullBoardGrid}>
            {cells.map((_, i) => (
              <div key={i} className={styles.boardCell} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
