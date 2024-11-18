// App.tsx
import React, { useState, useEffect, useCallback } from 'react';
import Board from './components/Board';
import Hand from './components/Hand';
import {
  drawCardForPlayer,
  calculateValidMoves,
  initializePlayer,
} from './utils';
import {
  PlayerEnum,
  ColorEnum,
  Move,
  BoardState,
  STARTING_INDICES,
  BOARD_SIZE,
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

  const updateHandAndDrawCard = useCallback(
    (playerId: PlayerEnum, cardIndex: number) => {
      setPlayers((prevPlayers) => {
        const updatedPlayer = { ...prevPlayers[playerId] };
        updatedPlayer.hand[cardIndex] = null;
        drawCardForPlayer(updatedPlayer);
        return { ...prevPlayers, [playerId]: updatedPlayer };
      });
    },
    []
  );

  const playMove = useCallback(
    (move: Move, playerId: PlayerEnum) => {
      const { cellIndex, cardIndex } = move;
      const card = players[playerId].hand[cardIndex]!;

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
        card
          ? calculateValidMoves(
              cardIndex,
              playerId,
              boardState,
              BOARD_SIZE,
              isFirst,
              player.hand,
              STARTING_INDICES
            ).map((cellIndex) => ({ cellIndex, cardIndex }))
          : []
      );
    },
    [players, boardState, firstMove]
  );

  const playForPlayer = useCallback(
    (playerId: PlayerEnum) => {
      const isFirst = firstMove[playerId];
      const player = players[playerId];

      if (isFirst) {
        const cardIndex = player.hand.findIndex((card) => card !== null);
        playMove(
          { cellIndex: STARTING_INDICES[playerId], cardIndex },
          playerId
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
      }

      setPlayerTurn(
        playerId === PlayerEnum.PLAYER1
          ? PlayerEnum.PLAYER2
          : PlayerEnum.PLAYER1
      );
    },
    [firstMove, players, getValidMoves, playMove]
  );

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
        STARTING_INDICES
      );
      setHighlightedCells(validMoves);
    },
    [boardState, firstMove, players]
  );

  const placeCardOnBoard = (index: number, cardIndex: number) => {
    playMove({ cellIndex: index, cardIndex }, PlayerEnum.PLAYER1);
    setHighlightedCells([]);
    setPlayerTurn(PlayerEnum.PLAYER2);
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
