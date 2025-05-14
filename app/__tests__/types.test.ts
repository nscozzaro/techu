// types.test.ts
import {
  newCard,
  SUITS,
  RANKS,
  SUIT_COLORS,
  PlayerColor,
  Board,
  newCell,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  Row,
  Col
} from '../lib';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const allSuits = Object.values(SUITS);
const allRanks = Object.values(RANKS);

const randomSuit = (): typeof allSuits[number] =>
  allSuits[Math.floor(Math.random() * allSuits.length)];

const randomRank = (): typeof allRanks[number] =>
  allRanks[Math.floor(Math.random() * allRanks.length)];

// ---------------------------------------------------------------------------
// newCard
// ---------------------------------------------------------------------------

describe('newCard', () => {
  it('creates a card with valid suit and rank', () => {
    const suit = randomSuit();
    const rank = randomRank();
    const card = newCard(suit, rank);
    expect(card).not.toBeNull();
    expect(card?.suit).toBe(suit);
    expect(card?.rank).toBe(rank);
  });

  it('returns null when suit is null', () => {
    const card = newCard(null, randomRank());
    expect(card).toBeNull();
  });

  it('returns null when rank is null', () => {
    const card = newCard(randomSuit(), null);
    expect(card).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Card Color Tests
// ---------------------------------------------------------------------------

describe.each(Object.entries(SUIT_COLORS) as [typeof SUITS[keyof typeof SUITS], PlayerColor][])('Card Colors', (suit, expectedColor) => {
  it(`suit "${suit}" has color "${expectedColor}"`, () => {
    const card = newCard(suit, randomRank());
    expect(card).not.toBeNull();
    expect(SUIT_COLORS[card!.suit]).toBe(expectedColor);
  });
});

// ---------------------------------------------------------------------------
// newCell
// ---------------------------------------------------------------------------

describe('newCell', () => {
  it('creates a cell with empty cards array', () => {
    const cell = newCell([]);
    expect(cell).not.toBeNull();
    expect(cell?.cards).toEqual([]);
  });

  it('creates a cell with provided cards', () => {
    const cards = [newCard(randomSuit(), randomRank())!];
    const cell = newCell(cards);
    expect(cell).not.toBeNull();
    expect(cell?.cards).toEqual(cards);
  });

  it('returns null when cards is null', () => {
    const cell = newCell(null);
    expect(cell).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

describe('Board', () => {
  describe('new', () => {
    it(`creates a ${BOARD_WIDTH}x${BOARD_HEIGHT} board with all cells empty`, () => {
      const board = Board.new();
      const cells = board.getCells();

      expect(cells).toHaveLength(BOARD_HEIGHT);
      cells.forEach(row => {
        expect(row).toHaveLength(BOARD_WIDTH);
        row.forEach(cell => {
          expect(cell).not.toBeNull();
          expect(cell?.cards).toEqual([]); // Empty stack
        });
      });
    });
  });

  describe('getCell', () => {
    const board = Board.new();

    describe.each([
      { row: 0 as Row, col: 0 as Col, expected: true },
      { row: (BOARD_HEIGHT - 1) as Row, col: (BOARD_WIDTH - 1) as Col, expected: true },
      { row: -1 as Row, col: 0 as Col, expected: false },
      { row: 0 as Row, col: -1 as Col, expected: false },
      { row: BOARD_HEIGHT as Row, col: 0 as Col, expected: false },
      { row: 0 as Row, col: BOARD_WIDTH as Col, expected: false },
    ])('at ($row, $col)', ({ row, col, expected }) => {
      it(`returns ${expected ? 'a cell' : 'null'}`, () => {
        const cell = board.getCell(row, col);
        if (expected) {
          expect(cell).not.toBeNull();
          expect(cell?.cards).toEqual([]);
        } else {
          expect(cell).toBeNull();
        }
      });
    });
  });
});
