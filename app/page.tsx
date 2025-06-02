'use client';

import dynamic from 'next/dynamic';

const BoardComponent = dynamic(() => import('./types').then(mod => mod.BoardComponent), { ssr: false });

export default function Home() {
  return (
    <div>
      <BoardComponent />
    </div>
  );
}
