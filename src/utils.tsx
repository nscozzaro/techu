// utils.tsx

// Define types for card properties and deck
type Suit = '♥' | '♦' | '♣' | '♠';
type Color = 'red' | 'black';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

interface Card {
    suit: Suit;
    rank: Rank;
    color: Color;
}

type Deck = Card[];
type Hand = (Card | null)[];

// Define types for state update functions
type SetDeck = React.Dispatch<React.SetStateAction<Deck>>;
type SetHand = React.Dispatch<React.SetStateAction<Hand>>;

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

// Helper function to check if selected card has a higher rank than the top card
export const isSelectedCardGreaterThanTopCard = (selectedCard: Card, topCard: Card): boolean => {
    return getCardRank(selectedCard.rank) > getCardRank(topCard.rank);
};

// Helper function to check if a move is valid on the first move
export const isFirstMoveValidIndex = (selectedCard: Card, topCard: Card | undefined): boolean => {
    if (!topCard) return true; // Empty space is valid
    return getCardRank(selectedCard.rank) > getCardRank(topCard.rank); // Can play on opponent's lower-ranked card
};

// Get home row indices based on player type
export const getHomeRowIndices = (playerType: 'player' | 'bot', boardSize: number): { start: number; end: number } => {
    if (playerType === 'player') {
        return { start: boardSize * (boardSize - 1), end: boardSize * boardSize };
    } else {
        return { start: 0, end: boardSize };
    }
};

// Explore connected cells starting from initial cells in home row
export const exploreConnectedCells = (
    initialCells: number[],
    currentBoardState: Card[][],
    color: Color,
    boardSize: number,
    getAdjacentIndices: (index: number, boardSize: number) => number[]
): Set<number> => {
    const visited = new Set<number>();
    const queue = [...initialCells];

    initialCells.forEach((cell) => visited.add(cell));

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

    return visited;
};

// Find cells connected to the home row for the given player type and board state
export const findConnectedCellsToHomeRow = (
    playerType: 'player' | 'bot',
    currentBoardState: Card[][],
    color: Color,
    boardSize: number,
    getAdjacentIndices: (index: number, boardSize: number) => number[]
): number[] => {
    const { start, end } = getHomeRowIndices(playerType, boardSize);
    const initialCells: number[] = [];

    for (let i = start; i < end; i++) {
        const stack = currentBoardState[i];
        const topCard = stack[stack.length - 1];
        if (topCard && topCard.color === color) {
            initialCells.push(i);
        }
    }

    return Array.from(exploreConnectedCells(initialCells, currentBoardState, color, boardSize, getAdjacentIndices));
};
