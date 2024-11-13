export const shuffle = (deck) => {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
};

export const getAdjacentIndices = (index, boardSize) => {
    const indices = [];
    const row = Math.floor(index / boardSize);
    const col = index % boardSize;

    if (row > 0) indices.push(index - boardSize);
    if (row < boardSize - 1) indices.push(index + boardSize);
    if (col > 0) indices.push(index - 1);
    if (col < boardSize - 1) indices.push(index + 1);

    return indices;
};

export const getCardRank = (rank) => {
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

export const createDeck = (color) => {
    const suits = color === 'red' ? ['♥', '♦'] : ['♣', '♠'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    return suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank, color })));
};