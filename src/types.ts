export type Suit = '♥' | '♦' | '♣' | '♠';
export type Color = 'red' | 'black';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  color: Color;
}

export type Deck = Card[];
export type Hand = (Card | null)[];

export type SetDeck = React.Dispatch<React.SetStateAction<Deck>>;
export type SetHand = React.Dispatch<React.SetStateAction<Hand>>;