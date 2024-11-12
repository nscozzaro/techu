import React, { useState, useEffect, useCallback } from 'react';
import Board from './components/Board';
import Hand from './components/Hand';

function App() {
  const boardSize = 5;
  const playerHomeRow = boardSize * (boardSize - 1) + Math.floor(boardSize / 2);
  const botHomeRow = Math.floor(boardSize / 2);

  const [playerDeck, setPlayerDeck] = useState([]);
  const [botDeck, setBotDeck] = useState([]);
  const [playerHand, setPlayerHand] = useState([null, null, null]);
  const [botHand, setBotHand] = useState([null, null, null]);
  const [boardState, setBoardState] = useState(
    Array.from({ length: boardSize * boardSize }, () => [])
  );
  const [playerTurn, setPlayerTurn] = useState(true);
  const [isFirstMove, setIsFirstMove] = useState(true);
  const [isBotFirstMove, setIsBotFirstMove] = useState(true);
  const [highlightedCells, setHighlightedCells] = useState([]);

  // Initialize game
  const initializeGame = useCallback(() => {
    const pDeck = createDeck('red');
    const bDeck = createDeck('black');

    shuffle(pDeck);
    shuffle(bDeck);

    const initialPlayerHand = [];
    const initialBotHand = [];
    let newPDeck = [...pDeck];
    let newBDeck = [...bDeck];

    for (let i = 0; i < 3; i++) {
      initialPlayerHand.push(newPDeck.pop());
      initialBotHand.push(newBDeck.pop());
    }

    setPlayerDeck(newPDeck);
    setBotDeck(newBDeck);
    setPlayerHand(initialPlayerHand);
    setBotHand(initialBotHand);
  }, []);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  // Helper functions
  const createDeck = (color) => {
    const suits = color === 'red' ? ['♥', '♦'] : ['♣', '♠'];
    const ranks = [
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      'J',
      'Q',
      'K',
      'A',
    ];
    return suits.flatMap((suit) =>
      ranks.map((rank) => ({ suit, rank, color }))
    );
  };

  const shuffle = (deck) => {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  };

  const drawCard = (deck, setDeck, hand, setHand) => {
    const emptySlot = hand.findIndex((slot) => slot === null);
    if (deck.length > 0 && emptySlot !== -1) {
      const newDeck = [...deck];
      const card = newDeck.pop();
      const newHand = [...hand];
      newHand[emptySlot] = card;
      setDeck(newDeck);
      setHand(newHand);
    }
  };

  const getCardRank = (rank) => {
    const rankOrder = {
      '2': 2,
      '3': 3,
      '4': 4,
      '5': 5,
      '6': 6,
      '7': 7,
      '8': 8,
      '9': 9,
      '10': 10,
      J: 11,
      Q: 12,
      K: 13,
      A: 14,
    };
    return rankOrder[rank];
  };

  const getAdjacentIndices = (index) => {
    const indices = [];
    const row = Math.floor(index / boardSize);
    const col = index % boardSize;

    // Up
    if (row > 0) indices.push(index - boardSize);
    // Down
    if (row < boardSize - 1) indices.push(index + boardSize);
    // Left
    if (col > 0) indices.push(index - 1);
    // Right
    if (col < boardSize - 1) indices.push(index + 1);

    return indices;
  };

  const findConnectedCellsToHomeRow = (playerType) => {
    const visited = new Set();
    const queue = [];
    const colors = playerType === 'player' ? ['red'] : ['black'];

    let homeRowStart, homeRowEnd;
    if (playerType === 'player') {
      homeRowStart = boardSize * (boardSize - 1);
      homeRowEnd = boardSize * boardSize;
    } else {
      homeRowStart = 0;
      homeRowEnd = boardSize;
    }

    for (let i = homeRowStart; i < homeRowEnd; i++) {
      if (
        boardState[i] &&
        colors.includes(boardState[i][boardState[i].length - 1]?.color)
      ) {
        queue.push(i);
        visited.add(i);
      }
    }

    while (queue.length > 0) {
      const currentIndex = queue.shift();
      const adjacentIndices = getAdjacentIndices(currentIndex);

      adjacentIndices.forEach((adjIndex) => {
        if (
          adjIndex >= 0 &&
          adjIndex < boardSize * boardSize &&
          !visited.has(adjIndex) &&
          boardState[adjIndex] &&
          colors.includes(
            boardState[adjIndex][boardState[adjIndex].length - 1]?.color
          )
        ) {
          visited.add(adjIndex);
          queue.push(adjIndex);
        }
      });
    }

    return Array.from(visited);
  };

  const calculateValidMoves = (cardIndex) => {
    const selectedCard = playerHand[cardIndex];
    const selectedCardRank = getCardRank(selectedCard.rank);
    const validIndices = [];

    if (isFirstMove) {
      validIndices.push(playerHomeRow);
    } else {
      for (let i = boardSize * (boardSize - 1); i < boardSize * boardSize; i++) {
        if (boardState[i].length === 0) {
          validIndices.push(i);
        }
      }

      const connectedCells = findConnectedCellsToHomeRow('player');
      connectedCells.forEach((index) => {
        const adjacentIndices = getAdjacentIndices(index);
        adjacentIndices.forEach((adjIndex) => {
          if (adjIndex >= 0 && adjIndex < boardSize * boardSize) {
            const stack = boardState[adjIndex];
            const topCard = stack[stack.length - 1];

            if (!topCard) {
              validIndices.push(adjIndex);
            } else if (
              topCard.color !== selectedCard.color &&
              getCardRank(topCard.rank) < selectedCardRank
            ) {
              validIndices.push(adjIndex);
            }
          }
        });
      });
    }

    setHighlightedCells(validIndices);
  };

  const clearHighlights = () => {
    setHighlightedCells([]);
  };

  const placeCardOnBoard = (index, cardIndex) => {
    const selectedCard = playerHand[cardIndex];

    setBoardState((prevBoardState) => {
      const newBoardState = [...prevBoardState];
      newBoardState[index] = [...newBoardState[index], selectedCard];
      return newBoardState;
    });

    const newPlayerHand = [...playerHand];
    newPlayerHand[cardIndex] = null;
    setPlayerHand(newPlayerHand);

    setPlayerTurn(false);
    setIsFirstMove(false);
    clearHighlights();

    drawCard(playerDeck, setPlayerDeck, newPlayerHand, setPlayerHand);
    checkEndGame();
    setTimeout(botPlay, 500);
  };

  const botPlay = () => {
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

    setPlayerTurn(true);
    checkEndGame();
  };

  const handleBotFirstMove = () => {
    const botFirstMoveCell = botHomeRow;
    const botCardIndex = botHand.findIndex((card) => card !== null);
    if (botCardIndex !== -1) {
      const botCard = botHand[botCardIndex];

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
    setIsBotFirstMove(false);
    setPlayerTurn(true);
    drawCard(botDeck, setBotDeck, botHand, setBotHand);
  };

  const getBotValidMoves = () => {
    const validMoves = [];

    botHand.forEach((botCard, cardIndex) => {
      if (botCard) {
        const botCardRank = getCardRank(botCard.rank);

        for (let i = 0; i < boardSize; i++) {
          if (boardState[i].length === 0) {
            validMoves.push({ cellIndex: i, cardIndex });
          }
        }

        const connectedCells = findConnectedCellsToHomeRow('bot');
        connectedCells.forEach((index) => {
          const adjacentIndices = getAdjacentIndices(index);
          adjacentIndices.forEach((adjIndex) => {
            if (adjIndex >= 0 && adjIndex < boardSize * boardSize) {
              const stack = boardState[adjIndex];
              const topCard = stack[stack.length - 1];

              if (!topCard) {
                validMoves.push({ cellIndex: adjIndex, cardIndex });
              } else if (
                topCard.color === 'red' &&
                getCardRank(topCard.rank) < botCardRank
              ) {
                validMoves.push({ cellIndex: adjIndex, cardIndex });
              }
            }
          });
        });
      }
    });

    return validMoves;
  };

  const executeBotMove = (validMoves) => {
    const randomMove =
      validMoves[Math.floor(Math.random() * validMoves.length)];
    const cellIndex = randomMove.cellIndex;
    const cardIndex = randomMove.cardIndex;
    const botCard = botHand[cardIndex];

    setBoardState((prevBoardState) => {
      const newBoardState = [...prevBoardState];
      const stack = newBoardState[cellIndex];
      const topCard = stack[stack.length - 1];

      if (
        !topCard ||
        (topCard.color === 'red' &&
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
  };

  const discardBotCard = () => {
    const botCardIndex = botHand.findIndex((card) => card !== null);
    if (botCardIndex !== -1) {
      const newBotHand = [...botHand];
      newBotHand[botCardIndex] = null;
      setBotHand(newBotHand);

      drawCard(botDeck, setBotDeck, newBotHand, setBotHand);
    }
  };

  const checkEndGame = () => {
    if (
      playerDeck.length === 0 &&
      botDeck.length === 0 &&
      playerHand.every((card) => card === null) &&
      botHand.every((card) => card === null)
    ) {
      determineWinner();
    }
  };

  const determineWinner = () => {
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
      alert('Bot wins!');
    } else {
      alert("It's a tie!");
    }
  };

  return (
    <div className="App">
      <Hand cards={botHand} isBot={true} />
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
        calculateValidMoves={calculateValidMoves}
        clearHighlights={clearHighlights}
      />
    </div>
  );
}

export default App;
