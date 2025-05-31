'use client';

import { BoardComponent, game } from './types';

export default function Home() {
  return <BoardComponent board={game.board} />;
}
