// App.tsx
import React, { useState, useEffect } from 'react';
import Board from './components/Board';
import Hand from './components/Hand';
import DiscardPile from './components/DiscardPile';
import {
  drawCardForPlayer,
  calculateValidMoves,
  initializePlayer,
  getCardRank,
  getHomeRowIndices,
  getValidMoveIndices,
  updatePlayerHandAndDrawCard,
  applyMoveToBoardState,
  getNextPlayerTurn,
  calculateScores,
  isGameOver,
  getValidMoves,
} from './utils';
import {
  PlayerEnum,
  ColorEnum,
  Move,
  BoardState,
  STARTING_INDICES,
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

  const [isDraggingCard, setIsDraggingCard] = useState(false);

  const [scores, setScores] = useState({
    [PlayerEnum.PLAYER1]: 0,
    [PlayerEnum.PLAYER2]: 0,
  });

  const [gameOver, setGameOver] = useState(false);

  const updateHandAndDrawCard = (playerId: PlayerEnum, cardIndex: number) => {
    setPlayers((prevPlayers) => {
      const updatedPlayer = updatePlayerHandAndDrawCard(
        prevPlayers[playerId],
        cardIndex
      );
      return { ...prevPlayers, [playerId]: updatedPlayer };
    });
  };

  const handleCardDiscard = (cardIndex: number, playerId: PlayerEnum) => {
    if (gameOver) return;
    updateHandAndDrawCard(playerId, cardIndex);
    setPlayerTurn(getNextPlayerTurn(playerId));
  };

  const playMove = (move: Move, playerId: PlayerEnum) => {
    if (gameOver) return;
    const { cellIndex, cardIndex } = move;
    const card = players[playerId].hand[cardIndex];

    setBoardState((prevBoardState) =>
      applyMoveToBoardState(prevBoardState, cellIndex, card)
    );

    updateHandAndDrawCard(playerId, cardIndex);

    setFirstMove((prevFirstMove) => ({
      ...prevFirstMove,
      [playerId]: false,
    }));
  };

  const getValidMovesForPlayer = (playerId: PlayerEnum): Move[] => {
    const player = players[playerId];
    const isFirst = firstMove[playerId];
    return getValidMoves(
      player,
      playerId,
      boardState,
      BOARD_SIZE,
      isFirst,
      STARTING_INDICES,
      tieBreaker
    );
  };

  const playForPlayer = (playerId: PlayerEnum) => {
    if (gameOver) return;
    const isFirst = firstMove[playerId];

    if (isFirst) {
      const cardIndex = 0;
      const card = players[playerId].hand[cardIndex];
      const faceDownCard = { ...card, faceDown: true };
      updateHandAndDrawCard(playerId, cardIndex);

      let validMoves: Move[] = [];
      if (tieBreaker) {
        const homeRowIndices = getHomeRowIndices(playerId, BOARD_SIZE);
        const validCellIndices = getValidMoveIndices(
          homeRowIndices,
          boardState,
          card
        );
        validMoves = validCellIndices.map((cellIndex) => ({
          cellIndex,
          cardIndex,
        }));
      } else {
        validMoves = [{ cellIndex: STARTING_INDICES[playerId], cardIndex }];
      }

      if (validMoves.length > 0) {
        const move =
          validMoves[Math.floor(Math.random() * validMoves.length)];

        setInitialFaceDownCards((prev) => ({
          ...prev,
          [playerId]: {
            ...faceDownCard,
            cellIndex: move.cellIndex,
          },
        }));

        setBoardState((prevBoardState) =>
          applyMoveToBoardState(prevBoardState, move.cellIndex, faceDownCard)
        );
      } else {
        setPlayers((prevPlayers) => {
          const updatedPlayer = { ...prevPlayers[playerId] };
          drawCardForPlayer(updatedPlayer);
          return { ...prevPlayers, [playerId]: updatedPlayer };
        });
      }

      setFirstMove((prevFirstMove) => ({
        ...prevFirstMove,
        [playerId]: false,
      }));

      setPlayerTurn(getNextPlayerTurn(playerId));

      setHighlightedCells([]);
    } else {
      const validMoves = getValidMovesForPlayer(playerId);
      if (validMoves.length > 0) {
        const randomMove =
          validMoves[Math.floor(Math.random() * validMoves.length)];
        playMove(randomMove, playerId);
      } else {
        setPlayers((prevPlayers) => {
          const updatedPlayer = { ...prevPlayers[playerId] };
          drawCardForPlayer(updatedPlayer);
          return { ...prevPlayers, [playerId]: updatedPlayer };
        });
      }

      setPlayerTurn(getNextPlayerTurn(playerId));
    }

    if (isGameOver(players)) {
      setGameOver(true);
    }
  };

  useEffect(() => {
    if (
      initialFaceDownCards.hasOwnProperty(PlayerEnum.PLAYER1) &&
      initialFaceDownCards.hasOwnProperty(PlayerEnum.PLAYER2)
    ) {
      const flipInitialCards = () => {
        const card1 = initialFaceDownCards[PlayerEnum.PLAYER1];
        const card2 = initialFaceDownCards[PlayerEnum.PLAYER2];

        setBoardState((prevBoardState) => {
          const newBoardState = [...prevBoardState];

          if (card1) {
            const flippedCard1 = { ...card1, faceDown: false };
            const stack1 = newBoardState[card1.cellIndex];
            if (stack1.length > 0) {
              const newStack1 = [...stack1];
              newStack1[newStack1.length - 1] = flippedCard1;
              newBoardState[card1.cellIndex] = newStack1;
            }
          }

          if (card2) {
            const flippedCard2 = { ...card2, faceDown: false };
            const stack2 = newBoardState[card2.cellIndex];
            if (stack2.length > 0) {
              const newStack2 = [...stack2];
              newStack2[newStack2.length - 1] = flippedCard2;
              newBoardState[card2.cellIndex] = newStack2;
            }
          }

          return newBoardState;
        });

        const rank1 = card1 ? getCardRank(card1.rank) : -1;
        const rank2 = card2 ? getCardRank(card2.rank) : -1;

        if (rank1 === -1 && rank2 === -1) {
          setTieBreaker(false);
          setInitialFaceDownCards({});
        } else if (rank1 === -1) {
          setPlayerTurn(PlayerEnum.PLAYER2);
          setTieBreaker(false);
          setInitialFaceDownCards({});
        } else if (rank2 === -1) {
          setPlayerTurn(PlayerEnum.PLAYER1);
          setTieBreaker(false);
          setInitialFaceDownCards({});
        } else if (rank1 < rank2) {
          setPlayerTurn(PlayerEnum.PLAYER1);
          setTieBreaker(false);
          setInitialFaceDownCards({});
        } else if (rank2 < rank1) {
          setPlayerTurn(PlayerEnum.PLAYER2);
          setTieBreaker(false);
          setInitialFaceDownCards({});
        } else {
          setFirstMove({
            [PlayerEnum.PLAYER1]: true,
            [PlayerEnum.PLAYER2]: true,
          });
          setTieBreaker(true);
          setInitialFaceDownCards({});
          setPlayerTurn(PlayerEnum.PLAYER1);
        }
      };

      setTimeout(() => {
        flipInitialCards();
      }, 500);
    }
  }, [initialFaceDownCards]);

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
    setScores(calculateScores(boardState));
  }, [boardState]);

  const handleCardDrag = (cardIndex: number, playerId: PlayerEnum) => {
    if (gameOver) return;
    const validMoves = calculateValidMoves(
      cardIndex,
      playerId,
      boardState,
      BOARD_SIZE,
      firstMove[playerId],
      players[playerId].hand,
      STARTING_INDICES,
      tieBreaker
    );
    setHighlightedCells(validMoves);
  };

  const placeCardOnBoard = (index: number, cardIndex: number) => {
    if (gameOver) return;
    if (firstMove[PlayerEnum.PLAYER1]) {
      const card = players[PlayerEnum.PLAYER1].hand[cardIndex];
      const faceDownCard = { ...card, faceDown: true };
      updateHandAndDrawCard(PlayerEnum.PLAYER1, cardIndex);

      const cellIndex = index;

      setInitialFaceDownCards((prev) => ({
        ...prev,
        [PlayerEnum.PLAYER1]: {
          ...faceDownCard,
          cellIndex,
        },
      }));

      setBoardState((prevBoardState) =>
        applyMoveToBoardState(prevBoardState, cellIndex, faceDownCard)
      );

      setFirstMove((prevFirstMove) => ({
        ...prevFirstMove,
        [PlayerEnum.PLAYER1]: false,
      }));

      setPlayerTurn(PlayerEnum.PLAYER2);

      setHighlightedCells([]);
    } else {
      playMove({ cellIndex: index, cardIndex }, PlayerEnum.PLAYER1);
      setHighlightedCells([]);
      setPlayerTurn(PlayerEnum.PLAYER2);
    }

    if (isGameOver(players)) {
      setGameOver(true);
    }
  };

  let winner = '';
  if (gameOver) {
    if (scores[PlayerEnum.PLAYER1] > scores[PlayerEnum.PLAYER2]) {
      winner = 'Player 1 wins!';
    } else if (scores[PlayerEnum.PLAYER1] < scores[PlayerEnum.PLAYER2]) {
      winner = 'Player 2 wins!';
    } else {
      winner = 'It\'s a tie!';
    }
  }

  return (
    <div className="App">
      <div className="scoreboard">
        <div>Player 1 Score: {scores[PlayerEnum.PLAYER1]}</div>
        <div>Player 2 Score: {scores[PlayerEnum.PLAYER2]}</div>
        {gameOver && <div className="winner">{winner}</div>}
      </div>
      <Hand
        cards={players[PlayerEnum.PLAYER2].hand}
        playerId={PlayerEnum.PLAYER2}
        currentPlayerId={playerTurn}
      />
      <Board
        boardState={boardState}
        isPlayerTurn={playerTurn === PlayerEnum.PLAYER1 && !gameOver}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
      />
      {isDraggingCard && (
        <DiscardPile handleCardDiscard={handleCardDiscard} />
      )}
      <Hand
        cards={players[PlayerEnum.PLAYER1].hand}
        playerId={PlayerEnum.PLAYER1}
        currentPlayerId={playerTurn}
        handleCardDrag={handleCardDrag}
        clearHighlights={() => setHighlightedCells([])}
        setIsDraggingCard={setIsDraggingCard}
      />
    </div>
  );
}

export default App;
