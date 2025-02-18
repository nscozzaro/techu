// src/logic/moveCalculations.ts
import {
    BoardState,
    Cards,
    Card,
    ColorEnum,
    Move,
    PlayerEnum,
    RankEnum,
    StartingIndices,
  } from '../types';
  import { rankOrder } from '../types';
  
  /**
   * Compute valid moves (board + discard) for a given player.
   */
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
          ).map((cellIndex) => ({ type: 'board', cellIndex, cardIndex }))
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
  
  /**
   * Calculate valid board indices for a single card.
   * If tieBreaker is true, the entire home row is considered.
   */
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
    const connected = findConnectedCellsToHomeRow(
      playerType,
      boardState,
      selectedCard.color,
      boardSize
    );
    const connectedValid = connected.flatMap((index) => {
      const adjacent = getAdjacentIndices(index, boardSize);
      return getValidMoveIndices(adjacent, boardState, selectedCard);
    });
    return Array.from(new Set([...homeRowValid, ...connectedValid]));
  };
  
  /**
   * Return the indices of the player's home row.
   */
  export const getHomeRowIndices = (
    playerType: PlayerEnum,
    boardSize: number
  ): number[] => {
    const row = playerType === PlayerEnum.PLAYER1 ? boardSize - 1 : 0;
    return Array.from({ length: boardSize }, (_, i) => row * boardSize + i);
  };
  
  /**
   * Filter indices where the top card’s rank is lower than the selected card’s.
   */
  export const getValidMoveIndices = (
    indices: number[],
    boardState: BoardState,
    selectedCard: Card
  ): number[] =>
    indices.filter((index) => {
      const cell = boardState[index];
      const topCard = cell[cell.length - 1];
      return !topCard || getCardRank(selectedCard.rank) > getCardRank(topCard.rank);
    });
  
  /**
   * Convert a RankEnum to its numeric value.
   */
  export const getCardRank = (rank: RankEnum): number => rankOrder[rank];
  
  /**
   * Return all adjacent cell indices (up, down, left, right).
   */
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
  
  /**
   * Find cells connected to the player's home row that have the same color.
   */
  export const findConnectedCellsToHomeRow = (
    playerType: PlayerEnum,
    boardState: BoardState,
    color: ColorEnum,
    boardSize: number
  ): number[] => {
    const homeRow = getHomeRowIndices(playerType, boardSize).filter((i) => {
      const cell = boardState[i];
      const topCard = cell[cell.length - 1];
      return topCard && topCard.color === color;
    });
    return Array.from(exploreConnectedCells(homeRow, boardState, boardSize, color));
  };
  
  /**
   * Explore adjacent cells recursively that share the same color.
   */
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
  