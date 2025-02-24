import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import Cell from './Cell';
import { PlayerEnum } from '../types';
import {
  setDraggingPlayer,
  resetUI,
} from '../features/game';
import { selectHandForPlayer, selectDeckCountForPlayer } from '../selectors';

interface PlayerAreaProps {
  playerId: PlayerEnum;
}

const PlayerArea: React.FC<PlayerAreaProps> = ({ playerId }) => {
  const dispatch = useDispatch<AppDispatch>();

  // Get what we need from Redux:
  const {
    discardPile,
    firstMove,
    currentTurn,
    highlightedCells,
    highlightDiscardPile,
  } = useSelector((state: RootState) => ({
    discardPile: state.game.discard[playerId],
    firstMove: state.game.gameStatus.firstMove[playerId],
    currentTurn: state.game.turn.currentTurn,
    highlightedCells: state.game.highlightedCells,
    highlightDiscardPile: state.game.highlightDiscardPile,
  }));

  // Use our selectors:
  const deckCount = useSelector((state: RootState) =>
    selectDeckCountForPlayer(state, playerId)
  );
  const handCards = useSelector((state: RootState) =>
    selectHandForPlayer(state, playerId)
  );

  // Removed clearHighlights entirely; we now clear highlights directly in the drag-drop hook

  const handleDragStart = () => dispatch(setDraggingPlayer(playerId));
  const handleDragEnd = () => dispatch(resetUI());

  const renderDeck = () => (
    <Cell
      type="deck"
      count={deckCount}
      playerId={playerId}
      isCurrentPlayer={currentTurn === playerId}
    />
  );

  const renderDiscard = () => (
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

  const renderHand = () => {
    return handCards.map((card, index: number) => (
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

  return (
    <div className="player-area">
      {playerId === PlayerEnum.PLAYER1 ? (
        <>
          {renderDeck()}
          {renderHand()}
          {renderDiscard()}
        </>
      ) : (
        <>
          {renderDiscard()}
          {renderHand()}
          {renderDeck()}
        </>
      )}
    </div>
  );
};

export default PlayerArea;
