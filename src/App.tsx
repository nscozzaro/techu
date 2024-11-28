// App.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Board from './components/Board';
import PlayerArea from './components/PlayerArea';
import {
  initializePlayer,
  getNextPlayerTurn,
  calculateScores,
  isGameOver,
  performFirstMoveForPlayer,
  selectMoveForPlayer,
  applyMoveToBoardState,
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
import AnimatingCard from './components/AnimatingCard';

function App() {
  const [players, setPlayers] = useState(() => ({
    [PlayerEnum.PLAYER1]: initializePlayer(ColorEnum.RED, PlayerEnum.PLAYER1),
    [PlayerEnum.PLAYER2]: initializePlayer(ColorEnum.BLACK, PlayerEnum.PLAYER2),
  }));

  const [boardState, setBoardState] = useState<BoardState>(
    Array(BOARD_SIZE * BOARD_SIZE).fill([]) as BoardState
  );

  const [playerTurn, setPlayerTurn] = useState<PlayerEnum>(PlayerEnum.PLAYER1);

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

  const [discardPiles, setDiscardPiles] = useState<{ [key in PlayerEnum]: Card[] }>({
    [PlayerEnum.PLAYER1]: [],
    [PlayerEnum.PLAYER2]: [],
  });

  const [draggingPlayer, setDraggingPlayer] = useState<PlayerEnum | null>(null);
  const [highlightDiscardPile, setHighlightDiscardPile] = useState<boolean>(false);

  const [dealing, setDealing] = useState<boolean>(true);
  const [dealingCardsToPlayers, setDealingCardsToPlayers] = useState<Array<{
    playerId: PlayerEnum;
    handIndex: number;
  }>>([]);

  const [drawingCard, setDrawingCard] = useState<{
    playerId: PlayerEnum;
    handIndex: number;
  } | null>(null);

  const [playingCardAnimation, setPlayingCardAnimation] = useState<{
    playerId: PlayerEnum;
    fromHandIndex: number;
    toBoardIndex: number;
    card: Card;
  } | null>(null);

  const isDealingRef = useRef(false);

  const boardCellRefs = useRef<Array<HTMLDivElement | null>>([]);
  const player2HandRefs = useRef<Array<HTMLDivElement | null>>([]);

  const appRef = useRef<HTMLDivElement>(null);

  // Handler Functions

  const drawCardWithAnimation = useCallback(
    (playerId: PlayerEnum, handIndex: number, callback?: () => void) => {
      setDrawingCard({ playerId, handIndex });
      setTimeout(() => {
        setPlayers(prevPlayers => {
          const updatedPlayers = { ...prevPlayers };
          const player = updatedPlayers[playerId];
          if (player.deck.length > 0) {
            const newCard = player.deck.pop()!;
            player.hand = [...player.hand]; // Make a copy of the hand
            player.hand[handIndex] = newCard;
          }
          return updatedPlayers;
        });
        setDrawingCard(null);
        if (callback) callback();
      }, 1000);
    },
    []
  );

  const handleCardDiscard = useCallback(
    (cardIndex: number, playerId: PlayerEnum) => {
      if (gameOver || firstMove[playerId]) return;

      setPlayers(prevPlayers => {
        const updatedPlayers = { ...prevPlayers };
        const player = { ...updatedPlayers[playerId] };
        player.hand = [...player.hand]; // Copy the hand

        if (cardIndex >= 0 && cardIndex < player.hand.length) {
          const cardToDiscard = player.hand[cardIndex];
          if (!cardToDiscard) return prevPlayers;

          const discardedCard = { ...cardToDiscard, faceDown: true };
          setDiscardPiles(prev => ({
            ...prev,
            [playerId]: [...prev[playerId], discardedCard],
          }));

          player.hand[cardIndex] = undefined;
          updatedPlayers[playerId] = player;
        }

        return updatedPlayers;
      });

      drawCardWithAnimation(playerId, cardIndex, () => {
        setPlayerTurn(getNextPlayerTurn(playerId));
        setHighlightedCells([]);
        setHighlightDiscardPile(false);
      });
    },
    [gameOver, firstMove, drawCardWithAnimation]
  );

  const playForPlayer = useCallback(
    (playerId: PlayerEnum) => {
      if (gameOver) return;
      const isFirst = firstMove[playerId];

      if (isFirst) {
        const result = performFirstMoveForPlayer(
          players,
          playerId,
          boardState,
          tieBreaker
        );

        setPlayers(result.updatedPlayers);
        setFirstMove(result.newFirstMove);
        setPlayerTurn(result.nextPlayerTurn);
        setHighlightedCells([]);

        // Check if a move was made and animate it
        if (
          result.moveMade &&
          result.moveMade.type === 'board' &&
          result.moveMade.cellIndex !== undefined
        ) {
          const cardIndex = result.moveMade.cardIndex;
          const card = result.cardPlayed;
          if (card) {
            setPlayingCardAnimation({
              playerId,
              fromHandIndex: cardIndex,
              toBoardIndex: result.moveMade.cellIndex,
              card,
            });

            // After animation completes, update the boardState
            setTimeout(() => {
              const newBoardState = [...boardState];
              newBoardState[result.moveMade!.cellIndex!] = [
                ...newBoardState[result.moveMade!.cellIndex!],
                card,
              ];
              setBoardState(newBoardState);

              // Update initialFaceDownCards
              setInitialFaceDownCards((prev) => ({
                ...prev,
                [playerId]: { ...card, cellIndex: result.moveMade!.cellIndex! },
              }));

              setPlayingCardAnimation(null);
            }, 1000); // duration of animation
          }
        }
      } else {
        const selectedMove = selectMoveForPlayer(players, playerId, boardState);

        if (selectedMove) {
          if (selectedMove.type === 'board' && selectedMove.cellIndex !== undefined) {
            const cardIndex = selectedMove.cardIndex;
            const card = players[playerId].hand[cardIndex];
            if (!card) return;

            setPlayingCardAnimation({
              playerId,
              fromHandIndex: cardIndex,
              toBoardIndex: selectedMove.cellIndex,
              card,
            });

            // After animation completes, apply the move
            setTimeout(() => {
              const result = applyMoveToBoardState(boardState, players, selectedMove, playerId);
              setPlayers(result.updatedPlayers);
              setBoardState(result.newBoardState);

              const nextPlayerTurn = getNextPlayerTurn(playerId);
              setPlayerTurn(nextPlayerTurn);

              if (isGameOver(result.updatedPlayers)) {
                setGameOver(true);
              }
              setPlayingCardAnimation(null);
            }, 1000); // duration of animation
          } else if (selectedMove.type === 'discard') {
            // Handle discard
            const cardIndex = selectedMove.cardIndex;
            handleCardDiscard(cardIndex, playerId);
          }
        } else {
          // No valid moves, handle accordingly
        }
      }
    },
    [gameOver, firstMove, players, boardState, tieBreaker, handleCardDiscard]
  );

  const handleCardDrag = useCallback(
    (cardIndex: number, playerId: PlayerEnum) => {
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
      setHighlightDiscardPile(!firstMove[playerId]);
    },
    [gameOver, boardState, players, firstMove, tieBreaker]
  );

  const placeCardOnBoard = useCallback(
    (index: number, cardIndex: number) => {
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

      if (isGameOver(result.updatedPlayers)) {
        setGameOver(true);
      }
    },
    [gameOver, players, boardState, firstMove]
  );

  const clearHighlights = useCallback(() => {
    setHighlightedCells([]);
    setHighlightDiscardPile(false);
  }, []);

  const handleDragStart = useCallback((playerId: PlayerEnum) => {
    setDraggingPlayer(playerId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingPlayer(null);
    clearHighlights();
  }, [clearHighlights]);

  const swapCardsInHand = useCallback(
    (playerId: PlayerEnum, sourceIndex: number, targetIndex: number) => {
      if (playerId !== PlayerEnum.PLAYER1) return;

      setPlayers(prevPlayers => {
        const player = { ...prevPlayers[playerId] };
        player.hand = [...player.hand];

        if (
          sourceIndex < 0 ||
          sourceIndex >= player.hand.length ||
          targetIndex < 0 ||
          targetIndex >= player.hand.length
        ) {
          return prevPlayers;
        }

        const updatedHand = [...player.hand];
        const temp = updatedHand[sourceIndex];
        updatedHand[sourceIndex] = updatedHand[targetIndex];
        updatedHand[targetIndex] = temp;

        return {
          ...prevPlayers,
          [playerId]: {
            ...player,
            hand: updatedHand,
          },
        };
      });
    },
    []
  );

  // Dealing Cards Logic

  const dealCards = useCallback(() => {
    const cardsToDealPerPlayer = 3;
    let totalCardsDealt = 0;

    const dealNextCard = () => {
      if (totalCardsDealt >= cardsToDealPerPlayer) {
        setDealing(false);
        return;
      }

      const handIndex = totalCardsDealt;

      // Set dealing animation for both players
      setDealingCardsToPlayers([
        { playerId: PlayerEnum.PLAYER1, handIndex },
        { playerId: PlayerEnum.PLAYER2, handIndex },
      ]);

      setTimeout(() => {
        setPlayers(prevPlayers => {
          const updatedPlayers = { ...prevPlayers };

          // Deal card to Player 1
          const player1 = { ...updatedPlayers[PlayerEnum.PLAYER1] };
          player1.hand = [...player1.hand];
          player1.deck = [...player1.deck];

          if (player1.deck.length > 0) {
            const newCard = player1.deck.pop()!;
            player1.hand[handIndex] = newCard;
          }
          updatedPlayers[PlayerEnum.PLAYER1] = player1;

          // Deal card to Player 2
          const player2 = { ...updatedPlayers[PlayerEnum.PLAYER2] };
          player2.hand = [...player2.hand];
          player2.deck = [...player2.deck];

          if (player2.deck.length > 0) {
            const newCard = player2.deck.pop()!;
            player2.hand[handIndex] = newCard;
          }
          updatedPlayers[PlayerEnum.PLAYER2] = player2;

          return updatedPlayers;
        });

        // Clear dealing cards animation
        setDealingCardsToPlayers([]);

        totalCardsDealt++;

        setTimeout(dealNextCard, 500);
      }, 1000);
    };

    dealNextCard();
  }, []);

  // useEffect Hooks

  useEffect(() => {
    if (isDealingRef.current) return;
    isDealingRef.current = true;
    dealCards();
  }, [dealCards]);

  useEffect(() => {
    if (
      !dealing &&
      initialFaceDownCards[PlayerEnum.PLAYER1] &&
      initialFaceDownCards[PlayerEnum.PLAYER2]
    ) {
      const flipCards = () => {
        const result = flipInitialCardsLogic(initialFaceDownCards, boardState);
        setBoardState(result.newBoardState);
        setPlayerTurn(result.nextPlayerTurn);
        setTieBreaker(result.tieBreaker);
        setInitialFaceDownCards({});
        setFirstMove(result.firstMove);
      };
      setTimeout(flipCards, 500);
    }
  }, [dealing, initialFaceDownCards, boardState]);

  useEffect(() => {
    if (
      !dealing &&
      !drawingCard &&
      !playingCardAnimation &&
      playerTurn === PlayerEnum.PLAYER2 &&
      !gameOver
    ) {
      const executePlay = () => playForPlayer(PlayerEnum.PLAYER2);
      setTimeout(executePlay, firstMove[PlayerEnum.PLAYER2] ? 0 : 500);
    }
  }, [dealing, drawingCard, playingCardAnimation, playerTurn, gameOver, firstMove, playForPlayer, boardState]);

  useEffect(() => {
    const newScores = calculateScores(boardState);
    setScores(newScores);
  }, [boardState]);

  useEffect(() => {
    if (isGameOver(players)) {
      setGameOver(true);
    }
  }, [players]);

  // Determine Winner
  const winner = gameOver
    ? scores[PlayerEnum.PLAYER1] > scores[PlayerEnum.PLAYER2]
      ? 'Player 1 wins!'
      : scores[PlayerEnum.PLAYER1] < scores[PlayerEnum.PLAYER2]
      ? 'Player 2 wins!'
      : "It's a tie!"
    : '';

  return (
    <div className="App" ref={appRef} style={{ position: 'relative' }}>
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
        handleCardDrag={playerTurn === PlayerEnum.PLAYER2 ? handleCardDrag : undefined}
        handleCardDiscard={handleCardDiscard}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
        firstMove={firstMove[PlayerEnum.PLAYER2]}
        clearHighlights={clearHighlights}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        isCurrentPlayer={playerTurn === PlayerEnum.PLAYER2}
        isDiscardPileHighlighted={highlightDiscardPile && playerTurn === PlayerEnum.PLAYER2}
        swapCardsInHand={undefined}
        dealingCards={dealingCardsToPlayers.filter(dc => dc.playerId === PlayerEnum.PLAYER2)}
        drawingCard={drawingCard?.playerId === PlayerEnum.PLAYER2 ? drawingCard : null}
        handRefs={player2HandRefs}
        playingCardAnimation={playingCardAnimation?.playerId === PlayerEnum.PLAYER2 ? playingCardAnimation : null} // Add this line
      />

      <Board
        boardState={boardState}
        isPlayerTurn={playerTurn === PlayerEnum.PLAYER1 && !gameOver}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
        cellRefs={boardCellRefs}
        playingCardAnimation={playingCardAnimation} // Pass the animation state
      />

      {/* Player 1 Area */}
      <PlayerArea
        playerId={PlayerEnum.PLAYER1}
        deckCount={players[PlayerEnum.PLAYER1].deck.length}
        handCards={players[PlayerEnum.PLAYER1].hand}
        discardPile={discardPiles[PlayerEnum.PLAYER1]}
        isDragging={draggingPlayer === PlayerEnum.PLAYER1}
        handleCardDrag={playerTurn === PlayerEnum.PLAYER1 ? handleCardDrag : undefined}
        handleCardDiscard={handleCardDiscard}
        placeCardOnBoard={placeCardOnBoard}
        highlightedCells={highlightedCells}
        firstMove={firstMove[PlayerEnum.PLAYER1]}
        clearHighlights={clearHighlights}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        isCurrentPlayer={playerTurn === PlayerEnum.PLAYER1}
        isDiscardPileHighlighted={highlightDiscardPile && playerTurn === PlayerEnum.PLAYER1}
        swapCardsInHand={swapCardsInHand}
        dealingCards={dealingCardsToPlayers.filter(dc => dc.playerId === PlayerEnum.PLAYER1)}
        drawingCard={drawingCard?.playerId === PlayerEnum.PLAYER1 ? drawingCard : null}
      />

      {/* Animating Card */}
      {playingCardAnimation && (
        <AnimatingCard
          card={playingCardAnimation.card}
          fromElement={player2HandRefs.current[playingCardAnimation.fromHandIndex]}
          toElement={boardCellRefs.current[playingCardAnimation.toBoardIndex]}
          containerElement={appRef.current}
        />
      )}
    </div>
  );
}

export default App;
