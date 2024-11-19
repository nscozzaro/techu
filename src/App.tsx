import React, { useState, useEffect } from 'react';
import Board from './components/Board';
import PlayerArea from './components/PlayerArea';
import {
  initializePlayer,
  getNextPlayerTurn,
  calculateScores,
  isGameOver,
  performFirstMoveForPlayer,
  performRegularMoveForPlayer,
  handleCardDragLogic,
  placeCardOnBoardLogic,
  flipInitialCardsLogic,
} from './utils';
import {
  PlayerEnum,
  ColorEnum,
  BoardState,
  BOARD_SIZE,
  Card,
} from './types';

function App() {
  const [players, setPlayers] = useState({
    [PlayerEnum.PLAYER1]: initializePlayer(ColorEnum.RED, PlayerEnum.PLAYER1),
    [PlayerEnum.PLAYER2]: initializePlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2),
  });

  const [boardState, setBoardState] = useState<BoardState>(
    Array(BOARD_SIZE * BOARD_SIZE).fill([])
  );

  const [playerTurn, setPlayerTurn] = useState<PlayerEnum>(
    PlayerEnum.PLAYER1
  );

  const [firstMove, setFirstMove] = useState({
    [PlayerEnum.PLAYER1]: true,
    [PlayerEnum.PLAYER2]: true,
  });

  const [highlightedCells, setHighlightedCells] = useState<number[]>([]);
  const [initialFaceDownCards, setInitialFaceDownCards] = useState<{
    [key in PlayerEnum]?: Card & { cellIndex: number };
  }>({});
  const [tieBreaker, setTieBreaker] = useState(false);

  const [scores, setScores] = useState({
    [PlayerEnum.PLAYER1]: 0,
    [PlayerEnum.PLAYER2]: 0,
  });

  const [gameOver, setGameOver] = useState(false);

  // State for discard piles
  const [discardPiles, setDiscardPiles] = useState<{ [key in PlayerEnum]: Card[] }>({
    [PlayerEnum.PLAYER1]: [],
    [PlayerEnum.PLAYER2]: [],
  });

  // State to track which player is currently dragging
  const [draggingPlayer, setDraggingPlayer] = useState<PlayerEnum | null>(null);

  const handleCardDiscard = (cardIndex: number, playerId: PlayerEnum) => {
    if (gameOver) return;

    const updatedPlayers = { ...players };
    const player = updatedPlayers[playerId];

    if (cardIndex >= 0 && cardIndex < player.hand.length) {
      const discardedCard = player.hand[cardIndex];
      // Remove the card from player's hand
      player.hand.splice(cardIndex, 1);
      // Add the card to the discard pile
      setDiscardPiles((prev) => ({
        ...prev,
        [playerId]: [...prev[playerId], discardedCard],
      }));
      // Draw a new card if possible
      if (player.deck.length > 0) {
        player.hand.push(player.deck.pop()!);
      }
      setPlayers(updatedPlayers);
      setPlayerTurn(getNextPlayerTurn(playerId));
      // Clear highlighted cells
      setHighlightedCells([]);
    }
  };

  const playForPlayer = (playerId: PlayerEnum) => {
    if (gameOver) return;
    const isFirst = firstMove[playerId];

    if (isFirst) {
      const result = performFirstMoveForPlayer(
        players,
        playerId,
        boardState,
        tieBreaker,
        setInitialFaceDownCards
      );
      setPlayers(result.updatedPlayers);
      setBoardState(result.newBoardState);
      setFirstMove(result.newFirstMove);
      setPlayerTurn(result.nextPlayerTurn);
      setHighlightedCells([]);
    } else {
      const result = performRegularMoveForPlayer(
        players,
        playerId,
        boardState
      );
      setPlayers(result.updatedPlayers);
      setBoardState(result.newBoardState);
      setPlayerTurn(result.nextPlayerTurn);
      const { moveMade } = result;
      if (!moveMade && playerId === PlayerEnum.PLAYER2) {
        // Discard the first card (index 0) for Player 2
        handleCardDiscard(0, PlayerEnum.PLAYER2);
      }
    }
  };

  const handleCardDrag = (cardIndex: number, playerId: PlayerEnum) => {
    if (gameOver) return;
    const validMoves = handleCardDragLogic(
      cardIndex,
      playerId,
      boardState,
      players,
      firstMove,
      tieBreaker
    );
    setHighlightedCells(validMoves);
  };

  const placeCardOnBoard = (index: number, cardIndex: number) => {
    if (gameOver) return;
    const result = placeCardOnBoardLogic(
      index,
      cardIndex,
      players,
      boardState,
      firstMove,
      setInitialFaceDownCards
    );
    setPlayers(result.updatedPlayers);
    setBoardState(result.newBoardState);
    setFirstMove(result.newFirstMove);
    setPlayerTurn(result.nextPlayerTurn);
    setHighlightedCells([]);

    if (isGameOver(result.updatedPlayers)) {
      setGameOver(true);
    }
  };

  const clearHighlights = () => {
    setHighlightedCells([]);
  };

  const handleDragStart = (playerId: PlayerEnum) => {
    setDraggingPlayer(playerId);
  };

  const handleDragEnd = () => {
    setDraggingPlayer(null);
    clearHighlights();
  };

  useEffect(() => {
    if (
      initialFaceDownCards[PlayerEnum.PLAYER1] &&
      initialFaceDownCards[PlayerEnum.PLAYER2]
    ) {
      setTimeout(() => {
        const result = flipInitialCardsLogic(
          initialFaceDownCards,
          boardState
        );
        setBoardState(result.newBoardState);
        setPlayerTurn(result.nextPlayerTurn);
        setTieBreaker(result.tieBreaker);
        setInitialFaceDownCards({});
        setFirstMove(result.firstMove);
      }, 500);
    }
  }, [initialFaceDownCards, boardState]);

  useEffect(() => {
    if (playerTurn === PlayerEnum.PLAYER2 && !gameOver) {
      if (!firstMove[PlayerEnum.PLAYER2]) {
        setTimeout(() => playForPlayer(PlayerEnum.PLAYER2), 500);
      } else {
        playForPlayer(PlayerEnum.PLAYER2);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerTurn]);

  useEffect(() => {
    const newScores = calculateScores(boardState);
    setScores(newScores);
  }, [boardState]);

  useEffect(() => {
    if (isGameOver(players)) {
      setGameOver(true);
    }
  }, [players]);

  const winner = gameOver
    ? scores[PlayerEnum.PLAYER1] > scores[PlayerEnum.PLAYER2]
      ? 'Player 1 wins!'
      : scores[PlayerEnum.PLAYER1] < scores[PlayerEnum.PLAYER2]
      ? 'Player 2 wins!'
      : "It's a tie!"
    : '';

  return (
    <div className="App">
      <div className="scoreboard">
        <div>Player 1 Score: {scores[PlayerEnum.PLAYER1]}</div>
        <div>Player 2 Score: {scores[PlayerEnum.PLAYER2]}</div>
        {gameOver && <div className="winner">{winner}</div>}
      </div>

      {/* Player 2 Area */}
      <PlayerArea
        playerId={PlayerEnum.PLAYER2}
        deckCount={players[PlayerEnum.PLAYER2].deck.length}
        handCards={players[PlayerEnum.PLAYER2].hand}
        discardPile={discardPiles[PlayerEnum.PLAYER2]}
        isDragging={draggingPlayer === PlayerEnum.PLAYER2}
        handleCardDrag={handleCardDrag}
        handleCardDiscard={handleCardDiscard}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
        firstMove={firstMove[PlayerEnum.PLAYER2]}
        clearHighlights={clearHighlights}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
      />

      <Board
        boardState={boardState}
        isPlayerTurn={playerTurn === PlayerEnum.PLAYER1 && !gameOver}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
      />

      {/* Player 1 Area */}
      <PlayerArea
        playerId={PlayerEnum.PLAYER1}
        deckCount={players[PlayerEnum.PLAYER1].deck.length}
        handCards={players[PlayerEnum.PLAYER1].hand}
        discardPile={discardPiles[PlayerEnum.PLAYER1]}
        isDragging={draggingPlayer === PlayerEnum.PLAYER1}
        handleCardDrag={handleCardDrag}
        handleCardDiscard={handleCardDiscard}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
        firstMove={firstMove[PlayerEnum.PLAYER1]}
        clearHighlights={clearHighlights}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
      />
    </div>
  );
}

export default App;
