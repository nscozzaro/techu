// src/components/PlayerArea.tsx
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import Cell from './Cell';
import { PlayerEnum } from '../types';
import { setDraggingPlayer, resetUI } from '../features/game';
import { selectHandForPlayer, selectDeckCountForPlayer } from '../selectors';

interface PlayerAreaProps {
  playerId: PlayerEnum;
}

const PlayerArea: React.FC<PlayerAreaProps> = ({ playerId }) => {
  const dispatch = useDispatch<AppDispatch>();

  const { discardPile, firstMove, currentTurn, highlightedCells, highlightDiscardPile } =
    useSelector((state: RootState) => ({
      discardPile: state.game.discard[playerId],
      firstMove: state.game.gameStatus.firstMove[playerId],
      currentTurn: state.game.turn.currentTurn,
      highlightedCells: state.game.highlightedCells,
      highlightDiscardPile: state.game.highlightDiscardPile,
    }));

  const deckCount = useSelector((state: RootState) => selectDeckCountForPlayer(state, playerId));
  const handCards = useSelector((state: RootState) => selectHandForPlayer(state, playerId));

  const handleDragStart = () => dispatch(setDraggingPlayer(playerId));
  const handleDragEnd = () => dispatch(resetUI());

  // Create an array of 5 cells with proper ordering
  const cells = Array(5).fill(null).map((_, index) => {
    if (index === 0) {
      return playerId === PlayerEnum.PLAYER1 ? (
        <Cell
          key="deck"
          type="deck"
          count={deckCount}
          playerId={playerId}
          isCurrentPlayer={currentTurn === playerId}
        />
      ) : (
        <Cell
          key="discard"
          type="discard"
          stack={discardPile}
          playerId={playerId}
          isVisible={true}
          isCurrentPlayer={currentTurn === playerId}
          isDisabled={firstMove}
          isHighlighted={currentTurn === playerId ? highlightDiscardPile : false}
        />
      );
    } else if (index === 4) {
      return playerId === PlayerEnum.PLAYER1 ? (
        <Cell
          key="discard"
          type="discard"
          stack={discardPile}
          playerId={playerId}
          isVisible={true}
          isCurrentPlayer={currentTurn === playerId}
          isDisabled={firstMove}
          isHighlighted={currentTurn === playerId ? highlightDiscardPile : false}
        />
      ) : (
        <Cell
          key="deck"
          type="deck"
          count={deckCount}
          playerId={playerId}
          isCurrentPlayer={currentTurn === playerId}
        />
      );
    } else {
      const handIndex = index - 1;
      return (
        <Cell
          key={`hand-${handIndex}`}
          type="hand"
          card={handCards[handIndex]}
          index={handIndex}
          playerId={playerId}
          highlightedCells={highlightedCells}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          isCurrentPlayer={currentTurn === playerId}
        />
      );
    }
  });

  return (
    <div className={`player-area ${playerId === PlayerEnum.PLAYER2 ? 'player-area-top' : 'player-area-bottom'}`}>
      {cells}
    </div>
  );
};

export default PlayerArea;
