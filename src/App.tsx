import React, { useState, useEffect, useCallback } from 'react';
import Board from './components/Board';
import Hand from './components/Hand';

import {
  drawCardForPlayer,
  calculateValidMoves,
  initializePlayer,
} from './utils';

import {
  Player,
  BoardState,
  Move,
  Moves,
  PlayerEnum,
  ColorEnum,
} from './types';

function App() {
  const boardSize = 5;
  const startingCellIndexPlayer1 = boardSize * (boardSize - 1) + Math.floor(boardSize / 2);
  const startingCellIndexPlayer2 = Math.floor(boardSize / 2);

  const [player1, setPlayer1] = useState<Player>(initializePlayer(ColorEnum.RED, PlayerEnum.PLAYER1));
  const [player2, setPlayer2] = useState<Player>(initializePlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2));
  const [boardState, setBoardState] = useState<BoardState>(
    Array.from({ length: boardSize * boardSize }, () => [])
  );
  const [playerTurn, setPlayerTurn] = useState(true);
  const [isFirstMove, setIsFirstMove] = useState(true);
  const [isPlayer2FirstMove, setIsPlayer2FirstMove] = useState(true);
  const [highlightedCells, setHighlightedCells] = useState<number[]>([]);

  const updateHandAndDrawCard = (player: Player, setPlayer: React.Dispatch<React.SetStateAction<Player>>, cardIndex: number) => {
    const updatedPlayer = { ...player };
    updatedPlayer.hand[cardIndex] = null;
    drawCardForPlayer(updatedPlayer);
    setPlayer(updatedPlayer);
  };

  const getValidMoves = useCallback(
    (player: Player, playerType: PlayerEnum, isFirstMove: boolean): Moves => {
      return player.hand.flatMap((card, cardIndex) =>
        card
          ? calculateValidMoves(
              cardIndex,
              playerType,
              boardState,
              boardSize,
              isFirstMove,
              player.hand,
              startingCellIndexPlayer1,
              startingCellIndexPlayer2
            ).map((cellIndex) => ({ cellIndex, cardIndex }))
          : []
      );
    },
    [boardState, boardSize, startingCellIndexPlayer1, startingCellIndexPlayer2]
  );

  const playMove = useCallback(
    (move: Move, player: Player, setPlayer: React.Dispatch<React.SetStateAction<Player>>) => {
      const { cellIndex, cardIndex } = move;
      const card = player.hand[cardIndex]!;

      setBoardState((prevBoardState) => {
        const newBoardState = [...prevBoardState];
        newBoardState[cellIndex] = [...newBoardState[cellIndex], card];
        return newBoardState;
      });

      updateHandAndDrawCard(player, setPlayer, cardIndex);
    },
    []
  );

  const playForPlayer2 = useCallback(() => {
    if (isPlayer2FirstMove) {
      playMove(
        {
          cellIndex: startingCellIndexPlayer2,
          cardIndex: player2.hand.findIndex((card) => card !== null),
        },
        player2,
        setPlayer2
      );
      setIsPlayer2FirstMove(false);
    } else {
      const validMoves = getValidMoves(player2, PlayerEnum.PLAYER2, isPlayer2FirstMove);
      if (validMoves.length > 0) {
        playMove(validMoves[Math.floor(Math.random() * validMoves.length)], player2, setPlayer2);
      } else {
        const updatedPlayer = { ...player2 };
        drawCardForPlayer(updatedPlayer);
        setPlayer2(updatedPlayer);
      }
    }
    setPlayerTurn(true);
  }, [player2, getValidMoves, playMove, isPlayer2FirstMove, startingCellIndexPlayer2]);

  const initializeGame = useCallback(() => {
    setPlayer1(initializePlayer(ColorEnum.RED, PlayerEnum.PLAYER1));
    setPlayer2(initializePlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2));
  }, []);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  useEffect(() => {
    if (!playerTurn) setTimeout(playForPlayer2, 500);
  }, [playerTurn, playForPlayer2]);

  const calculatePlayerValidMoves = (cardIndex: number) => {
    setHighlightedCells(
      calculateValidMoves(
        cardIndex,
        PlayerEnum.PLAYER1,
        boardState,
        boardSize,
        isFirstMove,
        player1.hand,
        startingCellIndexPlayer1,
        startingCellIndexPlayer2
      )
    );
  };

  const placeCardOnBoard = (index: number, cardIndex: number) => {
    playMove({ cellIndex: index, cardIndex }, player1, setPlayer1);
    setIsFirstMove(false);
    setHighlightedCells([]);
    setPlayerTurn(false);
  };

  return (
    <div className="App">
      <Hand
        cards={player2.hand}
        isBot
        playerTurn={playerTurn}
        calculateValidMoves={calculatePlayerValidMoves}
        clearHighlights={() => setHighlightedCells([])}
      />
      <Board
        boardSize={boardSize}
        boardState={boardState}
        playerTurn={playerTurn}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
      />
      <Hand
        cards={player1.hand}
        isBot={false}
        playerTurn={playerTurn}
        calculateValidMoves={calculatePlayerValidMoves}
        clearHighlights={() => setHighlightedCells([])}
      />
    </div>
  );
}

export default App;
