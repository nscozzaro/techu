// Enums for players
export enum PlayerEnum {
  PLAYER1 = 'PLAYER1',
  PLAYER2 = 'PLAYER2',
}

// Enum for card colors
export enum ColorEnum {
  RED = 'RED',
  BLACK = 'BLACK',
}

// Enum for suits
export enum SuitEnum {
  HEARTS = '♥',
  DIAMONDS = '♦',
  CLUBS = '♣',
  SPADES = '♠',
}

// Enum for ranks
export enum RankEnum {
  TWO = '2',
  THREE = '3',
  FOUR = '4',
  FIVE = '5',
  SIX = '6',
  SEVEN = '7',
  EIGHT = '8',
  NINE = '9',
  TEN = '10',
  JACK = 'J',
  QUEEN = 'Q',
  KING = 'K',
  ACE = 'A',
}

// Card interface with player reference
export interface Card {
  suit: SuitEnum; // Suit of the card
  rank: RankEnum; // Rank of the card
  color: ColorEnum; // Color of the card
  owner: PlayerEnum; // Owner of the card
}

// Player type definition
export interface Player {
  hand: Hand; // Cards in hand
  deck: Deck; // Remaining deck of cards
  id: PlayerEnum; // Player identifier
}

// Deck and Hand types
export type Deck = Card[];
export type Hand = (Card | null)[];

// Board state type
export type BoardState = Card[][];

// Move type for representing a player's move
export interface Move {
  cellIndex: number; // Target cell index on the board
  cardIndex: number; // Index of the card in the player's hand
}

// List of valid moves
export type Moves = Move[];

// Type definitions for React state setters
export type SetDeck = React.Dispatch<React.SetStateAction<Deck>>;
export type SetHand = React.Dispatch<React.SetStateAction<Hand>>;
