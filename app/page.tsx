import { Board, BoardComponent, BOARD_ROWS, BOARD_COLS } from './types';

export default function Home() {
  const board = new Board(BOARD_ROWS, BOARD_COLS);
  return <BoardComponent board={board} />;
}
