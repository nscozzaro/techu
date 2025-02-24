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

  // Consolidate cell rendering based on type.
  const renderCell = (type: 'deck' | 'hand' | 'discard') => {
    if (type === 'deck') {
      return (
        <Cell
          type="deck"
          count={deckCount}
          playerId={playerId}
          isCurrentPlayer={currentTurn === playerId}
        />
      );
    }
    if (type === 'discard') {
      return (
        <Cell
          type="discard"
          stack={discardPile}
          playerId={playerId}
          isVisible={true}
          isCurrentPlayer={currentTurn === playerId}
          isDisabled={firstMove}
          isHighlighted={currentTurn === playerId ? highlightDiscardPile : false}
        />
      );
    }
    // Render hand cells.
    return handCards.map((card, index) => (
      <Cell
        key={index}
        type="hand"
        card={card}
        index={index}
        playerId={playerId}
        highlightedCells={highlightedCells}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        isCurrentPlayer={currentTurn === playerId}
      />
    ));
  };

  // For Player1 the order is deck, hand, discard; for Player2 it's reversed for deck and discard.
  const order: Array<'deck' | 'hand' | 'discard'> =
    playerId === PlayerEnum.PLAYER1 ? ['deck', 'hand', 'discard'] : ['discard', 'hand', 'deck'];

  return (
    <div className="player-area">
      {order.map((type) => (
        <React.Fragment key={type}>{renderCell(type)}</React.Fragment>
      ))}
    </div>
  );
};

export default PlayerArea;
