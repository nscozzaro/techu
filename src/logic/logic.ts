// src/logic/logic.ts
import {
    Cards,
    ColorEnum,
    PlayerEnum,
    SuitEnum,
    RankEnum,
    BoardState,
    Card,
    Move,
    StartingIndices,
  } from '../types';
  import { rankOrder } from '../types';
  
  /* ---------- Deck Functions ---------- */
  export const shuffle = (deck: Cards): void => {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  };
  
  export const createDeck = (color: ColorEnum, owner: PlayerEnum): Cards => {
    const suits =
      color === ColorEnum.RED ? [SuitEnum.HEARTS, SuitEnum.DIAMONDS] : [SuitEnum.CLUBS, SuitEnum.SPADES];
    const ranks = Object.values(RankEnum);
    return suits.flatMap(suit =>
      ranks.map(rank => ({ suit, rank, color, owner, faceDown: false }))
    );
  };
  
  /* ---------- Move Calculation Functions ---------- */
  export const getValidMoves = (
    playerHand: Cards,
    playerId: PlayerEnum,
    boardState: BoardState,
    boardSize: number,
    isFirst: boolean,
    startingIndices: StartingIndices,
    tieBreaker: boolean
  ): Move[] => {
    const boardMoves: Move[] = playerHand.flatMap((card, cardIndex) =>
      card
        ? calculateValidMoves(
            cardIndex,
            playerId,
            boardState,
            boardSize,
            isFirst,
            playerHand,
            startingIndices,
            tieBreaker
          ).map(cellIndex => ({ type: 'board', cellIndex, cardIndex }))
        : []
    );
    if (!isFirst) {
      const discardMoves: Move[] = playerHand
        .map((card, cardIndex) => (card ? { type: 'discard', cardIndex } : null))
        .filter((move): move is Move => move !== null);
      return [...boardMoves, ...discardMoves];
    }
    return boardMoves;
  };
  
  export const calculateValidMoves = (
    cardIndex: number,
    playerType: PlayerEnum,
    boardState: BoardState,
    boardSize: number,
    isFirstMove: boolean,
    hand: Cards,
    startingIndices: StartingIndices,
    isTieBreaker?: boolean
  ): number[] => {
    const selectedCard = hand[cardIndex];
    if (!selectedCard) return [];
    if (isTieBreaker) {
      const homeRow = getHomeRowIndices(playerType, boardSize);
      return getValidMoveIndices(homeRow, boardState, selectedCard);
    }
    if (isFirstMove) return [startingIndices[playerType]];
    const homeRow = getHomeRowIndices(playerType, boardSize);
    const homeRowValid = getValidMoveIndices(homeRow, boardState, selectedCard);
    const connected = findConnectedCellsToHomeRow(playerType, boardState, selectedCard.color, boardSize);
    const connectedValid = connected.flatMap(index => {
      const adjacent = getAdjacentIndices(index, boardSize);
      return getValidMoveIndices(adjacent, boardState, selectedCard);
    });
    return Array.from(new Set([...homeRowValid, ...connectedValid]));
  };
  
  export const getHomeRowIndices = (playerType: PlayerEnum, boardSize: number): number[] => {
    const row = playerType === PlayerEnum.PLAYER1 ? boardSize - 1 : 0;
    return Array.from({ length: boardSize }, (_, i) => row * boardSize + i);
  };
  
  export const getValidMoveIndices = (
    indices: number[],
    boardState: BoardState,
    selectedCard: Card
  ): number[] =>
    indices.filter(index => {
      const cell = boardState[index];
      const topCard = cell[cell.length - 1];
      return !topCard || getCardRank(selectedCard.rank) > getCardRank(topCard.rank);
    });
  
  export const getCardRank = (rank: RankEnum): number => rankOrder[rank];
  
  export const getAdjacentIndices = (index: number, boardSize: number): number[] => {
    const row = Math.floor(index / boardSize);
    const col = index % boardSize;
    const indices: number[] = [];
    if (row > 0) indices.push(index - boardSize);
    if (row < boardSize - 1) indices.push(index + boardSize);
    if (col > 0) indices.push(index - 1);
    if (col < boardSize - 1) indices.push(index + 1);
    return indices;
  };
  
  export const findConnectedCellsToHomeRow = (
    playerType: PlayerEnum,
    boardState: BoardState,
    color: ColorEnum,
    boardSize: number
  ): number[] => {
    const homeRow = getHomeRowIndices(playerType, boardSize).filter(i => {
      const cell = boardState[i];
      const topCard = cell[cell.length - 1];
      return topCard && topCard.color === color;
    });
    return Array.from(exploreConnectedCells(homeRow, boardState, boardSize, color));
  };
  
  const exploreConnectedCells = (
    initialCells: number[],
    boardState: BoardState,
    boardSize: number,
    color: ColorEnum
  ): Set<number> => {
    const visited = new Set<number>(initialCells);
    const queue = [...initialCells];
    while (queue.length) {
      const current = queue.shift()!;
      for (const adj of getAdjacentIndices(current, boardSize)) {
        if (!visited.has(adj)) {
          const cell = boardState[adj];
          const topCard = cell[cell.length - 1];
          if (topCard && topCard.color === color) {
            visited.add(adj);
            queue.push(adj);
          }
        }
      }
    }
    return visited;
  };
  