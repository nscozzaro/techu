// App.tsx
import React, { useState, useEffect, useCallback } from 'react';
import Board from './components/Board';
import Hand from './components/Hand';
import {
  drawCardForPlayer,
  calculateValidMoves,
  initializePlayer,
  getCardRank,
  getHomeRowIndices,
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
    [PlayerEnum.PLAYER1]: initializePlayer(
      ColorEnum.RED,
      PlayerEnum.PLAYER1
    ),
    [PlayerEnum.PLAYER2]: initializePlayer(
      ColorEnum.BLACK,
      PlayerEnum.PLAYER2
    ),
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

  const updateHandAndDrawCard = useCallback(
    (playerId: PlayerEnum, cardIndex: number) => {
      setPlayers((prevPlayers) => {
        const updatedPlayer = { ...prevPlayers[playerId] };
        updatedPlayer.hand.splice(cardIndex, 1);
        drawCardForPlayer(updatedPlayer);
        return { ...prevPlayers, [playerId]: updatedPlayer };
      });
    },
    []
  );

  const playMove = useCallback(
    (move: Move, playerId: PlayerEnum) => {
      const { cellIndex, cardIndex } = move;
      const card = players[playerId].hand[cardIndex];

      setBoardState((prevBoardState) => {
        const newBoardState = [...prevBoardState];
        newBoardState[cellIndex] = [...newBoardState[cellIndex], card];
        return newBoardState;
      });

      updateHandAndDrawCard(playerId, cardIndex);

      setFirstMove((prevFirstMove) => ({
        ...prevFirstMove,
        [playerId]: false,
      }));
    },
    [players, updateHandAndDrawCard]
  );

  const getValidMoves = useCallback(
    (playerId: PlayerEnum): Move[] => {
      const player = players[playerId];
      const isFirst = firstMove[playerId];
      return player.hand.flatMap((card, cardIndex) =>
        calculateValidMoves(
          cardIndex,
          playerId,
          boardState,
          BOARD_SIZE,
          isFirst,
          player.hand,
          STARTING_INDICES,
          tieBreaker
        ).map((cellIndex) => ({ cellIndex, cardIndex }))
      );
    },
    [players, boardState, firstMove, tieBreaker]
  );

  const playForPlayer = useCallback(
    (playerId: PlayerEnum) => {
      const isFirst = firstMove[playerId];

      if (isFirst) {
        const cardIndex = 0;
        const card = players[playerId].hand[cardIndex];
        const faceDownCard = { ...card, faceDown: true };
        updateHandAndDrawCard(playerId, cardIndex);

        const cellIndex = tieBreaker
          ? getHomeRowIndices(playerId, BOARD_SIZE)[
              Math.floor(BOARD_SIZE / 2)
            ]
          : STARTING_INDICES[playerId];

        setInitialFaceDownCards((prev) => ({
          ...prev,
          [playerId]: {
            ...faceDownCard,
            cellIndex,
          },
        }));

        setFirstMove((prevFirstMove) => ({
          ...prevFirstMove,
          [playerId]: false,
        }));
      } else {
        const validMoves = getValidMoves(playerId);
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

        setPlayerTurn(
          playerId === PlayerEnum.PLAYER1
            ? PlayerEnum.PLAYER2
            : PlayerEnum.PLAYER1
        );
      }
    },
    [
      firstMove,
      getValidMoves,
      playMove,
      players,
      updateHandAndDrawCard,
      tieBreaker,
    ]
  );

  useEffect(() => {
    if (
      initialFaceDownCards[PlayerEnum.PLAYER1] &&
      initialFaceDownCards[PlayerEnum.PLAYER2]
    ) {
      // Both initial cards have been placed
      const flipInitialCards = () => {
        // Get the initial cards
        const card1 = initialFaceDownCards[PlayerEnum.PLAYER1];
        const card2 = initialFaceDownCards[PlayerEnum.PLAYER2];

        if (!card1 || !card2) return;

        // Flip the cards
        const flippedCard1 = { ...card1, faceDown: false };
        const flippedCard2 = { ...card2, faceDown: false };

        // Update the boardState to include these cards at their respective positions
        setBoardState((prevBoardState) => {
          const newBoardState = [...prevBoardState];
          newBoardState[card1.cellIndex] = [
            ...prevBoardState[card1.cellIndex],
            flippedCard1,
          ];
          newBoardState[card2.cellIndex] = [
            ...prevBoardState[card2.cellIndex],
            flippedCard2,
          ];
          return newBoardState;
        });

        // Compare the cards and determine who plays next
        const rank1 = getCardRank(card1.rank);
        const rank2 = getCardRank(card2.rank);

        if (rank1 < rank2) {
          // Player 1 has lower card, they play next
          setPlayerTurn(PlayerEnum.PLAYER1);
          setInitialFaceDownCards({});
          setTieBreaker(false);
        } else if (rank2 < rank1) {
          // Player 2 has lower card, they play next
          setPlayerTurn(PlayerEnum.PLAYER2);
          setInitialFaceDownCards({});
          setTieBreaker(false);
        } else {
          // Tie: Both players draw and play again in their home row
          setFirstMove({
            [PlayerEnum.PLAYER1]: true,
            [PlayerEnum.PLAYER2]: true,
          });
          setInitialFaceDownCards({});
          setTieBreaker(true);
          setPlayerTurn(PlayerEnum.PLAYER1);
        }
      };

      setTimeout(() => {
        flipInitialCards();
      }, 500);
    }
  }, [initialFaceDownCards]);

  useEffect(() => {
    if (playerTurn === PlayerEnum.PLAYER2) {
      setTimeout(() => playForPlayer(PlayerEnum.PLAYER2), 500);
    }
  }, [playerTurn, playForPlayer]);

  const handleCardDrag = useCallback(
    (cardIndex: number, playerId: PlayerEnum) => {
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
    },
    [boardState, firstMove, players, tieBreaker]
  );

  const placeCardOnBoard = (index: number, cardIndex: number) => {
    if (firstMove[PlayerEnum.PLAYER1]) {
      // For the first move, place the card face down
      const card = players[PlayerEnum.PLAYER1].hand[cardIndex];
      const faceDownCard = { ...card, faceDown: true };
      updateHandAndDrawCard(PlayerEnum.PLAYER1, cardIndex);

      const cellIndex = tieBreaker
        ? getHomeRowIndices(PlayerEnum.PLAYER1, BOARD_SIZE)[
            Math.floor(BOARD_SIZE / 2)
          ]
        : index;

      setInitialFaceDownCards((prev) => ({
        ...prev,
        [PlayerEnum.PLAYER1]: {
          ...faceDownCard,
          cellIndex,
        },
      }));

      setFirstMove((prevFirstMove) => ({
        ...prevFirstMove,
        [PlayerEnum.PLAYER1]: false,
      }));
      setHighlightedCells([]);
      setPlayerTurn(PlayerEnum.PLAYER2);
    } else {
      // Regular move
      playMove({ cellIndex: index, cardIndex }, PlayerEnum.PLAYER1);
      setHighlightedCells([]);
      setPlayerTurn(PlayerEnum.PLAYER2);
    }
  };

  return (
    <div className="App">
      <Hand
        cards={players[PlayerEnum.PLAYER2].hand}
        playerId={PlayerEnum.PLAYER2}
        currentPlayerId={playerTurn}
      />
      <Board
        boardState={boardState}
        isPlayerTurn={playerTurn === PlayerEnum.PLAYER1}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
      />
      <Hand
        cards={players[PlayerEnum.PLAYER1].hand}
        playerId={PlayerEnum.PLAYER1}
        currentPlayerId={playerTurn}
        handleCardDrag={handleCardDrag}
        clearHighlights={() => setHighlightedCells([])}
      />
    </div>
  );
}

export default App;
