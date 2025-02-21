import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import Cell from './Cell';
import { PlayerEnum, Card } from '../types';
import { setHighlightedCells, setDraggingPlayer, resetUI } from '../features/gameSlice';
import { swapCardsInHand } from '../features/gameSlice';

interface PlayerAreaProps {
  playerId: PlayerEnum;
}

const PlayerArea: React.FC<PlayerAreaProps> = ({ playerId }) => {
  const dispatch = useDispatch<AppDispatch>();
  const {
    player,
    discardPile,
    firstMove,
    currentTurn,
    highlightedCells,
    highlightDiscardPile,
  } = useSelector((state: RootState) => ({
    player: state.game.players[playerId],
    discardPile: state.game.discard[playerId],
    firstMove: state.game.gameStatus.firstMove[playerId],
    currentTurn: state.game.turn.currentTurn,
    highlightedCells: state.game.highlightedCells,
    highlightDiscardPile: state.game.highlightDiscardPile,
  }));

  const deckCount = player.deck.length;
  const handCards = player.hand;

  const clearHighlights = () => dispatch(setHighlightedCells([]));
  const handleDragStart = () => dispatch(setDraggingPlayer(playerId));
  const handleDragEnd = () => dispatch(resetUI());
  const handleSwapCards = (sourceIndex: number, targetIndex: number) => {
    if (playerId !== PlayerEnum.PLAYER1) return;
    dispatch(swapCardsInHand({ playerId, sourceIndex, targetIndex }));
  };

  const renderDeck = () => (
    <Cell
      type="deck"
      count={deckCount}
      playerId={playerId}
      clearHighlights={clearHighlights}
      isCurrentPlayer={currentTurn === playerId}
    />
  );

  const renderDiscard = () => (
    <Cell
      type="discard"
      stack={discardPile}
      playerId={playerId}
      isVisible={true}
      clearHighlights={clearHighlights}
      isCurrentPlayer={currentTurn === playerId}
      isDisabled={firstMove}
      isHighlighted={currentTurn === playerId ? highlightDiscardPile : false}
    />
  );

  const renderHand = () => {
    const cards: (Card | undefined)[] =
      playerId === PlayerEnum.PLAYER2 ? [...handCards].reverse() : handCards;
    return cards.map((card, index: number) => (
      <Cell
        key={index}
        type="hand"
        card={card}
        index={index}
        playerId={playerId}
        highlightedCells={highlightedCells}
        clearHighlights={clearHighlights}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        isCurrentPlayer={currentTurn === playerId}
        swapCardsInHand={
          playerId === PlayerEnum.PLAYER1
            ? (_: PlayerEnum, source: number, target: number) => handleSwapCards(source, target)
            : undefined
        }
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
