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
  getValidMoveIndices,
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

        let validMoves: Move[] = [];
        if (tieBreaker) {
          // During tie-breaker, get valid moves in home row
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
          // Non-tie-breaker first move: only starting index
          validMoves = [{ cellIndex: STARTING_INDICES[playerId], cardIndex }];
        }

        if (validMoves.length > 0) {
          // Randomly select a move from validMoves
          const move =
            validMoves[Math.floor(Math.random() * validMoves.length)];

          // For the initial face-down card, we need to set it in initialFaceDownCards
          setInitialFaceDownCards((prev) => ({
            ...prev,
            [playerId]: {
              ...faceDownCard,
              cellIndex: move.cellIndex,
            },
          }));

          // Update the boardState to include the face-down card
          setBoardState((prevBoardState) => {
            const newBoardState = [...prevBoardState];
            newBoardState[move.cellIndex] = [
              ...newBoardState[move.cellIndex],
              faceDownCard,
            ];
            return newBoardState;
          });
        } else {
          // No valid moves: draw a card
          setPlayers((prevPlayers) => {
            const updatedPlayer = { ...prevPlayers[playerId] };
            drawCardForPlayer(updatedPlayer);
            return { ...prevPlayers, [playerId]: updatedPlayer };
          });
        }

        // Regardless, set firstMove to false
        setFirstMove((prevFirstMove) => ({
          ...prevFirstMove,
          [playerId]: false,
        }));

        // **Set playerTurn to the other player**
        setPlayerTurn(
          playerId === PlayerEnum.PLAYER1
            ? PlayerEnum.PLAYER2
            : PlayerEnum.PLAYER1
        );
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
      boardState,
    ]
  );

  useEffect(() => {
    if (
      initialFaceDownCards.hasOwnProperty(PlayerEnum.PLAYER1) &&
      initialFaceDownCards.hasOwnProperty(PlayerEnum.PLAYER2)
    ) {
      // Both initial cards have been placed (even if one player couldn't play)
      const flipInitialCards = () => {
        const card1 = initialFaceDownCards[PlayerEnum.PLAYER1];
        const card2 = initialFaceDownCards[PlayerEnum.PLAYER2];

        // Flip the cards if they exist
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

        // Compare the cards and determine who plays next
        const rank1 = card1 ? getCardRank(card1.rank) : -1;
        const rank2 = card2 ? getCardRank(card2.rank) : -1;

        if (rank1 === -1 && rank2 === -1) {
          // Both players couldn't play; game ends or continue as per rules
          setTieBreaker(false);
          setInitialFaceDownCards({});
        } else if (rank1 === -1) {
          // Player 1 couldn't play; Player 2 plays next
          setPlayerTurn(PlayerEnum.PLAYER2);
          setTieBreaker(false);
          setInitialFaceDownCards({});
        } else if (rank2 === -1) {
          // Player 2 couldn't play; Player 1 plays next
          setPlayerTurn(PlayerEnum.PLAYER1);
          setTieBreaker(false);
          setInitialFaceDownCards({});
        } else if (rank1 < rank2) {
          // Player 1 has lower card, they play next
          setPlayerTurn(PlayerEnum.PLAYER1);
          setTieBreaker(false);
          setInitialFaceDownCards({});
        } else if (rank2 < rank1) {
          // Player 2 has lower card, they play next
          setPlayerTurn(PlayerEnum.PLAYER2);
          setTieBreaker(false);
          setInitialFaceDownCards({});
        } else {
          // Tie again: Both players draw and play again in their home row
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
    if (playerTurn === PlayerEnum.PLAYER2) {
      if (!firstMove[PlayerEnum.PLAYER2]) {
        setTimeout(() => playForPlayer(PlayerEnum.PLAYER2), 500);
      } else {
        // First move for Player 2
        playForPlayer(PlayerEnum.PLAYER2);
      }
    }
  }, [playerTurn, playForPlayer, firstMove]);

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

      const cellIndex = index;

      setInitialFaceDownCards((prev) => ({
        ...prev,
        [PlayerEnum.PLAYER1]: {
          ...faceDownCard,
          cellIndex,
        },
      }));

      // Update the boardState to include the face-down card
      setBoardState((prevBoardState) => {
        const newBoardState = [...prevBoardState];
        newBoardState[cellIndex] = [
          ...newBoardState[cellIndex],
          faceDownCard,
        ];
        return newBoardState;
      });

      setFirstMove((prevFirstMove) => ({
        ...prevFirstMove,
        [PlayerEnum.PLAYER1]: false,
      }));

      // **Set playerTurn to Player 2**
      setPlayerTurn(PlayerEnum.PLAYER2);

      setHighlightedCells([]);
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
