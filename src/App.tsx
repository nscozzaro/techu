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

type Suit = '♥' | '♦' | '♣' | '♠';
type Color = 'red' | 'black';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

interface Card {
  suit: Suit;
  rank: Rank;
  color: Color;
}

type Deck = Card[];
type HandType = (Card | null)[];

interface Move {
  cellIndex: number;
  cardIndex: number;
}

function App() {
  const boardSize = 5;
  const playerHomeRow = boardSize * (boardSize - 1) + Math.floor(boardSize / 2);
  const botHomeRow = Math.floor(boardSize / 2);

  const [playerDeck, setPlayerDeck] = useState<Deck>([]);
  const [botDeck, setBotDeck] = useState<Deck>([]);
  const [playerHand, setPlayerHand] = useState<HandType>([null, null, null]);
  const [botHand, setBotHand] = useState<HandType>([null, null, null]);
  const [boardState, setBoardState] = useState<Card[][]>(
    Array.from({ length: boardSize * boardSize }, () => [])
  );
  const [playerTurn, setPlayerTurn] = useState(true);
  const [isFirstMove, setIsFirstMove] = useState(true);
  const [isBotFirstMove, setIsBotFirstMove] = useState(true);
  const [highlightedCells, setHighlightedCells] = useState<number[]>([]);

  const updateHandAndDrawCard = (hand: HandType, setHand: React.Dispatch<React.SetStateAction<HandType>>, deck: Deck, setDeck: React.Dispatch<React.SetStateAction<Deck>>, cardIndex: number) => {
    const newHand = [...hand];
    newHand[cardIndex] = null;
    setHand(newHand);
    drawCard(deck, setDeck, newHand, setHand);
  };

  const getValidMoves = useCallback(
    (hand: HandType, playerType: 'player' | 'bot', isFirstMove: boolean): Move[] => {
      return hand.flatMap((card, cardIndex) =>
        card
          ? calculateValidMoves(
            cardIndex,
            playerType,
            boardState,
            boardSize,
            isFirstMove,
            hand,
            playerHomeRow,
            botHomeRow
          ).map((cellIndex) => ({ cellIndex, cardIndex }))
          : []
      );
    },
    [boardState, boardSize, playerHomeRow, botHomeRow]
  );

  const botPlayMove = useCallback(
    (move: Move) => {
      const { cellIndex, cardIndex } = move;
      const botCard = botHand[cardIndex]!;

      setBoardState((prevBoardState) => {
        const newBoardState = [...prevBoardState];
        newBoardState[cellIndex] = [...newBoardState[cellIndex], botCard];
        return newBoardState;
      });

      updateHandAndDrawCard(botHand, setBotHand, botDeck, setBotDeck, cardIndex);
    },
    [botHand, botDeck]
  );

  const botPlay = useCallback(() => {
    if (isBotFirstMove) {
      botPlayMove({ cellIndex: botHomeRow, cardIndex: botHand.findIndex((card) => card !== null) });
      setIsBotFirstMove(false);
    } else {
      const validMoves = getValidMoves(botHand, 'bot', isBotFirstMove);
      if (validMoves.length > 0) {
        botPlayMove(validMoves[Math.floor(Math.random() * validMoves.length)]);
      } else {
        updateHandAndDrawCard(botHand, setBotHand, botDeck, setBotDeck, botHand.findIndex((card) => card !== null));
      }
    }
    setPlayerTurn(true);
  }, [botHand, botDeck, botHomeRow, getValidMoves, botPlayMove, isBotFirstMove]);

  const checkEndGame = useCallback(() => {
    if (playerDeck.length === 0 && botDeck.length === 0 && playerHand.every((card) => card === null) && botHand.every((card) => card === null)) {
      const playerScore = boardState.reduce((acc, stack) => acc + (stack[stack.length - 1]?.color === 'red' ? 1 : 0), 0);
      const botScore = boardState.reduce((acc, stack) => acc + (stack[stack.length - 1]?.color === 'black' ? 1 : 0), 0);
      alert(playerScore > botScore ? 'Player wins!' : botScore > playerScore ? 'Bot wins!' : "It's a tie!");
    }
  }, [playerDeck, botDeck, playerHand, botHand, boardState]);

  const initializeGame = useCallback(() => {
    const pDeck = createDeck('red');
    const bDeck = createDeck('black');
    shuffle(pDeck);
    shuffle(bDeck);

    setPlayerDeck(pDeck.slice(3));
    setBotDeck(bDeck.slice(3));
    setPlayerHand([pDeck[0], pDeck[1], pDeck[2]]);
    setBotHand([bDeck[0], bDeck[1], bDeck[2]]);
  }, []);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  useEffect(() => {
    if (!playerTurn) setTimeout(botPlay, 500);
  }, [playerTurn, botPlay]);

  const calculatePlayerValidMoves = (cardIndex: number) => {
    setHighlightedCells(calculateValidMoves(cardIndex, 'player', boardState, boardSize, isFirstMove, playerHand, playerHomeRow, botHomeRow));
  };

  const placeCardOnBoard = (index: number, cardIndex: number) => {
    const selectedCard = playerHand[cardIndex]!;

    setBoardState((prevBoardState) => {
      const newBoardState = [...prevBoardState];
      newBoardState[index] = [...newBoardState[index], selectedCard];
      return newBoardState;
    });

    updateHandAndDrawCard(playerHand, setPlayerHand, playerDeck, setPlayerDeck, cardIndex);
    setIsFirstMove(false);
    setHighlightedCells([]);
    checkEndGame();
    setPlayerTurn(false);
  };

  return (
    <div className="App">
      <Hand cards={botHand} isBot playerTurn={playerTurn} calculateValidMoves={calculatePlayerValidMoves} clearHighlights={() => setHighlightedCells([])} />
      <Board boardSize={boardSize} boardState={boardState} playerTurn={playerTurn} placeCardOnBoard={placeCardOnBoard} highlightedCells={highlightedCells} />
      <Hand cards={playerHand} isBot={false} playerTurn={playerTurn} calculateValidMoves={calculatePlayerValidMoves} clearHighlights={() => setHighlightedCells([])} />
    </div>
  );
}

export default App;
