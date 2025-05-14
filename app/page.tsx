import { Board } from './components/Board';
import { BOARD_ROWS, BOARD_COLS } from './types';

export default function Home() {
  return <Board num_rows={BOARD_ROWS} num_cols={BOARD_COLS} />;
}
