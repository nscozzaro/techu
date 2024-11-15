// App.tsx
import React, { useState, useEffect, useCallback } from 'react';
import Board from './components/Board';
import Hand from './components/Hand';

import {
  createDeck,
  getAdjacentIndices,
  getCardRank,
  shuffle,
  drawCard,
  isSelectedCardGreaterThanTopCard, isFirstMoveValidIndex
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
  const [playerTurn, setPlayerTurn] = useState<boolean>(true);
  const [isFirstMove, setIsFirstMove] = useState<boolean>(true);
  const [isBotFirstMove, setIsBotFirstMove] = useState<boolean>(true);
  const [highlightedCells, setHighlightedCells] = useState<number[]>([]);

  const findConnectedCellsToHomeRow = useCallback(
    (playerType: 'player' | 'bot', currentBoardState: Card[][]): number[] => {
      const visited = new Set<number>();
      const queue: number[] = [];
      const color: Color = playerType === 'player' ? 'red' : 'black';

      let homeRowStart: number, homeRowEnd: number;
      if (playerType === 'player') {
        homeRowStart = boardSize * (boardSize - 1);
        homeRowEnd = boardSize * boardSize;
      } else {
        homeRowStart = 0;
        homeRowEnd = boardSize;
      }

      for (let i = homeRowStart; i < homeRowEnd; i++) {
        const stack = currentBoardState[i];
        const topCard = stack[stack.length - 1];

        if (topCard && topCard.color === color) {
          queue.push(i);
          visited.add(i);
        }
      }

      while (queue.length > 0) {
        const currentIndex = queue.shift()!;
        const adjacentIndices = getAdjacentIndices(currentIndex, boardSize);

        adjacentIndices.forEach((adjIndex) => {
          if (
            adjIndex >= 0 &&
            adjIndex < boardSize * boardSize &&
            !visited.has(adjIndex)
          ) {
            const stack = currentBoardState[adjIndex];
            const topCard = stack[stack.length - 1];

            if (topCard && topCard.color === color) {
              visited.add(adjIndex);
              queue.push(adjIndex);
            }
          }
        });
      }

      return Array.from(visited);
    },
    [boardSize]
  );

  const calculateValidMoves = useCallback(
    (cardIndex: number, playerType: 'player' | 'bot'): number[] => {
      const isBot = playerType === 'bot';
      const hand = isBot ? botHand : playerHand;
      const selectedCard = hand[cardIndex]!;
      const validIndices: number[] = [];
      const homeRowStart = isBot ? 0 : boardSize * (boardSize - 1);
      const homeRowEnd = isBot ? boardSize : boardSize * boardSize;
      const middleHomeRowIndex = isBot ? botHomeRow : playerHomeRow;
  
      const isPlayerFirstMove = isBot ? isBotFirstMove : isFirstMove;
  
      if (isPlayerFirstMove) {
        validIndices.push(middleHomeRowIndex);
      } else {
        for (let i = homeRowStart; i < homeRowEnd; i++) {
          const stack = boardState[i];
          const topCard = stack[stack.length - 1];
          if (isFirstMoveValidIndex(selectedCard, topCard)) {
            validIndices.push(i);
          }
        }
  
        const connectedCells = findConnectedCellsToHomeRow(playerType, boardState);
  
        connectedCells.forEach((index) => {
          const adjacentIndices = getAdjacentIndices(index, boardSize);
          adjacentIndices.forEach((adjIndex) => {
            if (adjIndex >= 0 && adjIndex < boardSize * boardSize) {
              const stack = boardState[adjIndex];
              const topCard = stack[stack.length - 1];
              if (
                !topCard ||
                isSelectedCardGreaterThanTopCard(selectedCard, topCard)
              ) {
                validIndices.push(adjIndex);
              }
            }
          });
        });
      }
  
      return validIndices;
    },
    [
      boardState,
      findConnectedCellsToHomeRow,
      boardSize,
      playerHand,
      botHand,
      isFirstMove,
      isBotFirstMove,
      playerHomeRow,
      botHomeRow,
    ]
  );

  const getBotValidMoves = useCallback((): Move[] => {
    const validMoves: Move[] = [];
    botHand.forEach((botCard, cardIndex) => {
      if (botCard) {
        const botValidIndices = calculateValidMoves(cardIndex, 'bot');
        botValidIndices.forEach((cellIndex) => {
          validMoves.push({ cellIndex, cardIndex });
        });
      }
    });
    return validMoves;
  }, [botHand, calculateValidMoves]);

  const executeBotMove = useCallback(
    (validMoves: Move[]) => {
      const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
      const cellIndex = randomMove.cellIndex;
      const cardIndex = randomMove.cardIndex;
      const botCard = botHand[cardIndex]!;

      setBoardState((prevBoardState) => {
        const newBoardState = [...prevBoardState];
        const stack = newBoardState[cellIndex];
        const topCard = stack[stack.length - 1];

        if (
          !topCard ||
          (topCard.color !== botCard.color &&
            getCardRank(topCard.rank) < getCardRank(botCard.rank)) ||
          // Allow bot to place on its own lower-ranked card
          (topCard.color === botCard.color &&
            getCardRank(topCard.rank) < getCardRank(botCard.rank))
        ) {
          newBoardState[cellIndex] = [...stack, botCard];
        }
        return newBoardState;
      });

      const newBotHand = [...botHand];
      newBotHand[cardIndex] = null;
      setBotHand(newBotHand);

      drawCard(botDeck, setBotDeck, newBotHand, setBotHand);
    },
    [botHand, botDeck]
  );

  const discardBotCard = useCallback(() => {
    const botCardIndex = botHand.findIndex((card) => card !== null);
    if (botCardIndex !== -1) {
      const newBotHand = [...botHand];
      newBotHand[botCardIndex] = null;
      setBotHand(newBotHand);

      drawCard(botDeck, setBotDeck, newBotHand, setBotHand);
    }
  }, [botHand, botDeck]);

  const handleBotFirstMove = useCallback(() => {
    const botFirstMoveCell = botHomeRow;
    const botCardIndex = botHand.findIndex((card) => card !== null);
    if (botCardIndex !== -1) {
      const botCard = botHand[botCardIndex]!;

      setBoardState((prevBoardState) => {
        const newBoardState = [...prevBoardState];
        newBoardState[botFirstMoveCell] = [
          ...newBoardState[botFirstMoveCell],
          botCard,
        ];
        return newBoardState;
      });

      const newBotHand = [...botHand];
      newBotHand[botCardIndex] = null;
      setBotHand(newBotHand);
    }
    setIsBotFirstMove(false); // Reset after the first move
    drawCard(botDeck, setBotDeck, botHand, setBotHand);
    setPlayerTurn(true);
  }, [botHand, botDeck, botHomeRow]);


  const determineWinner = useCallback(() => {
    let playerCount = 0;
    let botCount = 0;

    boardState.forEach((stack) => {
      const topCard = stack[stack.length - 1];
      if (topCard) {
        if (topCard.color === 'red') {
          playerCount++;
        } else {
          botCount++;
        }
      }
    });

    if (playerCount > botCount) {
      alert('Player wins!');
    } else if (botCount > playerCount) {
      alert("Bot wins!");
    } else {
      alert("It's a tie!");
    }
  }, [boardState]);

  const checkEndGame = useCallback(() => {
    if (
      playerDeck.length === 0 &&
      botDeck.length === 0 &&
      playerHand.every((card) => card === null) &&
      botHand.every((card) => card === null)
    ) {
      determineWinner();
    }
  }, [playerDeck, botDeck, playerHand, botHand, determineWinner]);

  const botPlay = useCallback(() => {
    if (isBotFirstMove) {
      handleBotFirstMove();
      return;
    }

    const validMoves = getBotValidMoves();

    if (validMoves.length > 0) {
      executeBotMove(validMoves);
    } else {
      discardBotCard();
    }

    checkEndGame();
    setPlayerTurn(true);
  }, [
    isBotFirstMove,
    handleBotFirstMove,
    getBotValidMoves,
    executeBotMove,
    discardBotCard,
    checkEndGame,
  ]);

  useEffect(() => {
    if (!playerTurn) {
      setTimeout(() => {
        botPlay();
      }, 500);
    }
  }, [playerTurn, botPlay]);

  const initializeGame = useCallback(() => {
    const pDeck = createDeck('red');
    const bDeck = createDeck('black');

    shuffle(pDeck);
    shuffle(bDeck);

    const initialPlayerHand: HandType = [];
    const initialBotHand: HandType = [];
    let newPDeck = [...pDeck];
    let newBDeck = [...bDeck];

    for (let i = 0; i < 3; i++) {
      initialPlayerHand.push(newPDeck.pop()!);
      initialBotHand.push(newBDeck.pop()!);
    }

    setPlayerDeck(newPDeck);
    setBotDeck(newBDeck);
    setPlayerHand(initialPlayerHand);
    setBotHand(initialBotHand);
  }, []);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  const calculatePlayerValidMoves = (cardIndex: number) => {
    const validIndices = calculateValidMoves(cardIndex, 'player');
    setHighlightedCells(validIndices);
  };

  const clearHighlights = () => {
    setHighlightedCells([]);
  };

  const placeCardOnBoard = (index: number, cardIndex: number) => {
    const selectedCard = playerHand[cardIndex]!;

    setBoardState((prevBoardState) => {
      const newBoardState = [...prevBoardState];
      newBoardState[index] = [...newBoardState[index], selectedCard];
      return newBoardState;
    });

    const newPlayerHand = [...playerHand];
    newPlayerHand[cardIndex] = null;
    setPlayerHand(newPlayerHand);

    if (isFirstMove) setIsFirstMove(false); // Reset after the first move
    clearHighlights();

    drawCard(playerDeck, setPlayerDeck, newPlayerHand, setPlayerHand);
    checkEndGame();
    setPlayerTurn(false);
  };


  return (
    <div className="App">
      <Hand
        cards={botHand}
        isBot={true}
        playerTurn={playerTurn}
        calculateValidMoves={calculatePlayerValidMoves}
        clearHighlights={clearHighlights}
      />
      <Board
        boardSize={boardSize}
        boardState={boardState}
        playerTurn={playerTurn}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
      />
      <Hand
        cards={playerHand}
        isBot={false}
        playerTurn={playerTurn}
        calculateValidMoves={calculatePlayerValidMoves}
        clearHighlights={clearHighlights}
      />
    </div>
  );
}

export default App;
