// App.tsx

import React, { useState, useEffect, useCallback } from 'react';
import Board from './components/Board';
import Hand from './components/Hand';

import {
  createDeck,
  shuffle,
  drawCard,
  calculateValidMoves,
} from './utils';

import { Card, Deck, Hand as HandType, BoardState, Move, Moves } from './types';

function App() {
  const boardSize = 5;
  const startingCellIndexPlayer1 = boardSize * (boardSize - 1) + Math.floor(boardSize / 2);
  const startingCellIndexPlayer2 = Math.floor(boardSize / 2);

  const [deckPlayer1, setDeckPlayer1] = useState<Deck>([]);
  const [deckPlayer2, setDeckPlayer2] = useState<Deck>([]);
  const [handPlayer1, setHandPlayer1] = useState<HandType>([null, null, null]);
  const [handPlayer2, setHandPlayer2] = useState<HandType>([null, null, null]);
  const [boardState, setBoardState] = useState<BoardState>(
    Array.from({ length: boardSize * boardSize }, () => [])
  );
  const [playerTurn, setPlayerTurn] = useState(true);
  const [isFirstMove, setIsFirstMove] = useState(true);
  const [isPlayer2FirstMove, setIsPlayer2FirstMove] = useState(true);
  const [highlightedCells, setHighlightedCells] = useState<number[]>([]);

  const updateHandAndDrawCard = (
    hand: HandType,
    setHand: React.Dispatch<React.SetStateAction<HandType>>,
    deck: Deck,
    setDeck: React.Dispatch<React.SetStateAction<Deck>>,
    cardIndex: number
  ) => {
    const newHand = [...hand];
    newHand[cardIndex] = null;
    setHand(newHand);
    drawCard(deck, setDeck, newHand, setHand);
  };

  const getValidMoves = useCallback(
    (hand: HandType, playerType: 'player1' | 'player2', isFirstMove: boolean): Moves => {
      return hand.flatMap((card: Card | null, cardIndex: number) =>
        card
          ? calculateValidMoves(
              cardIndex,
              playerType,
              boardState,
              boardSize,
              isFirstMove,
              hand,
              startingCellIndexPlayer1,
              startingCellIndexPlayer2
            ).map((cellIndex) => ({ cellIndex, cardIndex }))
          : []
      );
    },
    [boardState, boardSize, startingCellIndexPlayer1, startingCellIndexPlayer2]
  );

  const playMove = useCallback(
    (move: Move, hand: HandType, setHand: React.Dispatch<React.SetStateAction<HandType>>, deck: Deck, setDeck: React.Dispatch<React.SetStateAction<Deck>>) => {
      const { cellIndex, cardIndex } = move;
      const card = hand[cardIndex]!;

      setBoardState((prevBoardState) => {
        const newBoardState = [...prevBoardState];
        newBoardState[cellIndex] = [...newBoardState[cellIndex], card];
        return newBoardState;
      });

      updateHandAndDrawCard(hand, setHand, deck, setDeck, cardIndex);
    },
    []
  );

  const playForPlayer2 = useCallback(() => {
    if (isPlayer2FirstMove) {
      playMove(
        { cellIndex: startingCellIndexPlayer2, cardIndex: handPlayer2.findIndex((card) => card !== null) },
        handPlayer2,
        setHandPlayer2,
        deckPlayer2,
        setDeckPlayer2
      );
      setIsPlayer2FirstMove(false);
    } else {
      const validMoves = getValidMoves(handPlayer2, 'player2', isPlayer2FirstMove);
      if (validMoves.length > 0) {
        playMove(validMoves[Math.floor(Math.random() * validMoves.length)], handPlayer2, setHandPlayer2, deckPlayer2, setDeckPlayer2);
      } else {
        updateHandAndDrawCard(handPlayer2, setHandPlayer2, deckPlayer2, setDeckPlayer2, handPlayer2.findIndex((card) => card !== null));
      }
    }
    setPlayerTurn(true);
  }, [handPlayer2, deckPlayer2, startingCellIndexPlayer2, getValidMoves, playMove, isPlayer2FirstMove]);

  const checkEndGame = useCallback(() => {
    if (deckPlayer1.length === 0 && deckPlayer2.length === 0 && handPlayer1.every((card) => card === null) && handPlayer2.every((card) => card === null)) {
      const player1Score = boardState.reduce((acc, stack) => acc + (stack[stack.length - 1]?.color === 'red' ? 1 : 0), 0);
      const player2Score = boardState.reduce((acc, stack) => acc + (stack[stack.length - 1]?.color === 'black' ? 1 : 0), 0);
      alert(player1Score > player2Score ? 'Player 1 wins!' : player2Score > player1Score ? 'Player 2 wins!' : "It's a tie!");
    }
  }, [deckPlayer1, deckPlayer2, handPlayer1, handPlayer2, boardState]);

  const initializeGame = useCallback(() => {
    const deck1 = createDeck('red');
    const deck2 = createDeck('black');
    shuffle(deck1);
    shuffle(deck2);

    setDeckPlayer1(deck1.slice(3));
    setDeckPlayer2(deck2.slice(3));
    setHandPlayer1([deck1[0], deck1[1], deck1[2]]);
    setHandPlayer2([deck2[0], deck2[1], deck2[2]]);
  }, []);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  useEffect(() => {
    if (!playerTurn) setTimeout(playForPlayer2, 500);
  }, [playerTurn, playForPlayer2]);

  const calculatePlayerValidMoves = (cardIndex: number) => {
    setHighlightedCells(calculateValidMoves(cardIndex, 'player1', boardState, boardSize, isFirstMove, handPlayer1, startingCellIndexPlayer1, startingCellIndexPlayer2));
  };

  const placeCardOnBoard = (index: number, cardIndex: number) => {
    playMove({ cellIndex: index, cardIndex }, handPlayer1, setHandPlayer1, deckPlayer1, setDeckPlayer1);
    setIsFirstMove(false);
    setHighlightedCells([]);
    checkEndGame();
    setPlayerTurn(false);
  };

  return (
    <div className="App">
      <Hand cards={handPlayer2} isBot playerTurn={playerTurn} calculateValidMoves={calculatePlayerValidMoves} clearHighlights={() => setHighlightedCells([])} />
      <Board boardSize={boardSize} boardState={boardState} playerTurn={playerTurn} placeCardOnBoard={placeCardOnBoard} highlightedCells={highlightedCells} />
      <Hand cards={handPlayer1} isBot={false} playerTurn={playerTurn} calculateValidMoves={calculatePlayerValidMoves} clearHighlights={() => setHighlightedCells([])} />
    </div>
  );
}

export default App;
