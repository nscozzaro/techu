// cardUtils.test.ts
import {
  // core APIs
  createCard,
  getCardColor,
  getCardValue,
  getCardDisplayName,
  // data maps / constants
  SUITS,
  RANKS,
  SUIT_COLORS,
  RankValues,
  RankToDisplayNameMap,
  // types
  Suit,
  Rank,
  SuitColor,
  RankValue,
} from '../types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const allSuits = Object.values(SUITS) as Suit[];
const allRanks = Object.values(RANKS) as Rank[];

const randomSuit = (): Suit =>
  allSuits[Math.floor(Math.random() * allSuits.length)];

const randomRank = (): Rank =>
  allRanks[Math.floor(Math.random() * allRanks.length)];

// ---------------------------------------------------------------------------
// getCardColor
// ---------------------------------------------------------------------------

describe.each(Object.entries(SUIT_COLORS) as [Suit, SuitColor][])(
  'getCardColor',
  (suit, expectedColor) => {
    it(`returns "${expectedColor}" for suit "${suit}"`, () => {
      const card = createCard(suit, randomRank());
      expect(getCardColor(card)).toBe(expectedColor);
    });
  }
);

// ---------------------------------------------------------------------------
// getCardValue
// ---------------------------------------------------------------------------

describe.each(
  Object.entries(RankValues) as [Rank, RankValue][]
)('getCardValue', (rank, expectedValue) => {
  it(`returns ${expectedValue} for rank "${rank}"`, () => {
    const card = createCard(randomSuit(), rank);
    expect(getCardValue(card)).toBe(expectedValue);
  });

  it(`is consistent across all suits for rank "${rank}"`, () => {
    allSuits.forEach(suit => {
      const card = createCard(suit, rank);
      expect(getCardValue(card)).toBe(expectedValue);
    });
  });
});

// ---------------------------------------------------------------------------
// getCardDisplayName
// ---------------------------------------------------------------------------

describe.each(
  Object.entries(RankToDisplayNameMap) as [Rank, string][]
)('getCardDisplayName', (rank, expectedName) => {
  it(`returns "${expectedName}" for rank "${rank}"`, () => {
    const card = createCard(randomSuit(), rank);
    expect(getCardDisplayName(card)).toBe(expectedName);
  });

  it(`is lowercase for rank "${rank}"`, () => {
    const name = getCardDisplayName(createCard(randomSuit(), rank));
    expect(name).toBe(name.toLowerCase());
  });
});
