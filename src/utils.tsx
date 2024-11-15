import { Card, Deck, Hand, Suit, Color, Rank, SetDeck, SetHand} from './types'


// Shuffle function with deck type
export const shuffle = (deck: Deck): void => {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
};

// Get adjacent indices with explicit index and boardSize types
export const getAdjacentIndices = (index: number, boardSize: number): number[] => {
    const indices: number[] = [];
    const row = Math.floor(index / boardSize);
    const col = index % boardSize;

    if (row > 0) indices.push(index - boardSize);
    if (row < boardSize - 1) indices.push(index + boardSize);
    if (col > 0) indices.push(index - 1);
    if (col < boardSize - 1) indices.push(index + 1);

    return indices;
};

// Get card rank with specific rank type and return number
export const getCardRank = (rank: Rank): number => {
    const rankOrder: { [key in Rank]: number } = {
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

// Create a deck with color type and return Deck
export const createDeck = (color: Color): Deck => {
    const suits: Suit[] = color === 'red' ? ['♥', '♦'] : ['♣', '♠'];
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    return suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank, color })));
};

// Draw card with explicit types for parameters and state updates
export const drawCard = (deck: Deck, setDeck: SetDeck, hand: Hand, setHand: SetHand): void => {
    const emptySlot = hand.findIndex((slot) => slot === null);
    if (deck.length > 0 && emptySlot !== -1) {
        const newDeck = [...deck];
        const card = newDeck.pop() as Card;
        const newHand = [...hand];
        newHand[emptySlot] = card;
        setDeck(newDeck);
        setHand(newHand);
    }
};

// Check if selected card has a higher rank than the top card, handling undefined topCard
export const isSelectedCardGreaterThanTopCard = (selectedCard: Card, topCard: Card | undefined): boolean => {
    return !topCard || getCardRank(selectedCard.rank) > getCardRank(topCard.rank);
};

// Get home row indices based on player type
export const getHomeRowIndices = (playerType: 'player' | 'bot', boardSize: number): { start: number; end: number } => {
    return playerType === 'player'
        ? { start: boardSize * (boardSize - 1), end: boardSize * boardSize }
        : { start: 0, end: boardSize };
};

// Explore cells that are connected to initial cells and share the same color
export const exploreConnectedCells = (
    initialCells: number[],
    boardState: Card[][],
    boardSize: number,
    color: Color
): Set<number> => {
    const visited = new Set<number>();
    const queue = [...initialCells];
    initialCells.forEach((cell) => visited.add(cell));

    while (queue.length > 0) {
        const currentIndex = queue.shift()!;
        const adjacentIndices = getAdjacentIndices(currentIndex, boardSize);
        adjacentIndices.forEach((adjIndex) => {
            if (adjIndex >= 0 && adjIndex < boardSize * boardSize && !visited.has(adjIndex)) {
                const stack = boardState[adjIndex];
                const topCard = stack[stack.length - 1];
                if (topCard && topCard.color === color) {
                    visited.add(adjIndex);
                    queue.push(adjIndex);
                }
            }
        });
    }

    return visited;
};

// Find cells connected to the home row for a given player type and board state
export const findConnectedCellsToHomeRow = (
    playerType: 'player' | 'bot',
    boardState: Card[][],
    color: Color,
    boardSize: number
): number[] => {
    const { start, end } = getHomeRowIndices(playerType, boardSize);
    const initialCells = Array.from({ length: end - start }, (_, i) => start + i).filter(i => {
        const topCard = boardState[i][boardState[i].length - 1];
        return topCard && topCard.color === color;
    });

    return Array.from(exploreConnectedCells(initialCells, boardState, boardSize, color));
};

// Get valid move indices by checking if selectedCard outranks the top card on each stack
export const getValidMoveIndices = (
    indices: number[],
    boardState: Card[][],
    selectedCard: Card
): number[] => {
    return indices.filter(index => {
        const stack = boardState[index];
        const topCard = stack[stack.length - 1];
        return isSelectedCardGreaterThanTopCard(selectedCard, topCard);
    });
};

// Calculate valid moves by checking home row and connected cells
export const calculateValidMoves = (
    cardIndex: number,
    playerType: 'player' | 'bot',
    boardState: Card[][],
    boardSize: number,
    isFirstMove: boolean,
    hand: Hand,
    playerHomeRow: number,
    botHomeRow: number
): number[] => {
    const isBot = playerType === 'bot';
    const selectedCard = hand[cardIndex]!;
    const middleHomeRowIndex = isBot ? botHomeRow : playerHomeRow;

    if (isFirstMove) {
        return [middleHomeRowIndex];
    }

    const { start: homeRowStart, end: homeRowEnd } = getHomeRowIndices(playerType, boardSize);

    // Get indices within the player's home row where moves are valid
    const homeRowIndices = Array.from({ length: homeRowEnd - homeRowStart }, (_, i) => homeRowStart + i);
    const homeRowValidIndices = getValidMoveIndices(homeRowIndices, boardState, selectedCard);

    // Get adjacent indices for connected cells (allows moves to adjacent spaces based on card rank)
    const connectedCells = findConnectedCellsToHomeRow(
        playerType,
        boardState,
        playerType === 'player' ? 'red' : 'black',
        boardSize
    );
    const connectedValidIndices = connectedCells.flatMap((index) => {
        const adjacentIndices = getAdjacentIndices(index, boardSize);
        return getValidMoveIndices(adjacentIndices, boardState, selectedCard);
    });

    return [...homeRowValidIndices, ...connectedValidIndices];
};
