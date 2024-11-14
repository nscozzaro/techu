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
