'use client';

import styles from './page.module.css';
import React, { useRef } from 'react';

// === CONSTANTS ===
export type BoardDimension = number & { __brand: 'BoardDimension' };
export type CellIndex = number & { __brand: 'CellIndex' };
export type RowIndex = number & { __brand: 'RowIndex' };
export type ColumnIndex = number & { __brand: 'ColumnIndex' };
export type CellIndices = CellIndex[];
export type NumCells = number & { __brand: 'NumCells' };

export const BOARD_ROWS = 7 as BoardDimension;
export const BOARD_COLS = 5 as BoardDimension;
export const TOTAL_BOARD_CELLS = BOARD_ROWS * BOARD_COLS as NumCells;
export const PLAYER_ROW_1 = BOARD_ROWS - 1 as RowIndex;
export const PLAYER_ROW_2 = 0 as RowIndex;
export const DECK_CELL_1 = BOARD_ROWS * BOARD_COLS - BOARD_COLS as CellIndex;
export const DECK_CELL_2 = 0 as CellIndex;
export const NUM_HAND_CELLS = 3 as NumCells;
export const HAND_CELLS_1 = Array.from({ length: NUM_HAND_CELLS }, (_, i) => DECK_CELL_1 + i + 1) as CellIndices;
export const HAND_CELLS_2 = Array.from({ length: NUM_HAND_CELLS }, (_, i) => DECK_CELL_2 + i + 1) as CellIndices;
export const DISCARD_CELL_1 = BOARD_ROWS * BOARD_COLS - 1 as CellIndex;
export const DISCARD_CELL_2 = BOARD_COLS - 1 as CellIndex;
export const PLAYABLE_CELLS = Array.from({ length: BOARD_ROWS * BOARD_COLS - 2 * BOARD_COLS }, (_, i) => i + BOARD_COLS) as CellIndices;
export const GAME_STORAGE_KEY = 'gameState';

// Event Emitter System
export enum EventType {
    Save = 'save'
}

type EventCallback = () => void;
class EventEmitter {
    private static instance: EventEmitter;
    private listeners: Map<EventType, EventCallback[]> = new Map();

    private constructor() { }

    static getInstance(): EventEmitter {
        if (!EventEmitter.instance) {
            EventEmitter.instance = new EventEmitter();
        }
        return EventEmitter.instance;
    }

    on(event: EventType, callback: EventCallback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    off(event: EventType, callback: EventCallback) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            this.listeners.set(event, callbacks.filter(cb => cb !== callback));
        }
    }

    emit(event: EventType) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => callback());
        }
    }
}

export const eventEmitter = EventEmitter.getInstance();

export const SUIT_DATA = {
    Clubs: { symbol: '♣', color: 'black' },
    Diamonds: { symbol: '♦', color: 'red' },
    Hearts: { symbol: '♥', color: 'red' },
    Spades: { symbol: '♠', color: 'black' },
} as const;

export type Suit = keyof typeof SUIT_DATA;               // 'Clubs' | 'Diamonds' | 'Hearts' | 'Spades'
export type SuitSymbol = typeof SUIT_DATA[Suit]['symbol'];     // '♣' | '♦' | '♥' | '♠'
export type SuitColor = typeof SUIT_DATA[Suit]['color'];      // 'red' | 'black'

export const SUITS = Object.keys(SUIT_DATA) as readonly Suit[];

export enum SuitEnum {
    Clubs,
    Diamonds,
    Hearts,
    Spades,
}

export const RANKS = [
    'Two', 'Three', 'Four', 'Five', 'Six',
    'Seven', 'Eight', 'Nine', 'Ten',
    'Jack', 'Queen', 'King', 'Ace',
] as const;

export type Rank = typeof RANKS[number]; // 'Two' | ... | 'Ace'

type Branded<T, B> = T & { __brand: B };
export type RankValue = Branded<number, 'RankValue'>;

export const RANK_VALUES: Record<Rank, RankValue> = RANKS.reduce(
    (accumulator, rank, i) => ({ ...accumulator, [rank]: (i + 2) as RankValue }),
    {} as Record<Rank, RankValue>
);

export type CardID = `${Rank}Of${Suit}`;

export const CARD_MAP: Record<CardID, { rank: Rank; suit: Suit }> = SUITS.reduce(
    (map, suit) => {
        RANKS.forEach(rank => {
            const key = `${rank}Of${suit}` as CardID;
            map[key] = { rank, suit };
        });
        return map;
    },
    {} as Record<CardID, { rank: Rank; suit: Suit }>
);

export const CARDS = Object.keys(CARD_MAP) as readonly CardID[];

export type CardFaceUp = boolean;

export class Card {
    // Interaction state for click vs. drag
    private interactionState = {
        startX: 0,
        startY: 0,
        isDragging: false,
        potentialClick: false,
        domElement: null as (HTMLDivElement | null),
        parentCellContext: null as (Cell | null),
    };

    // Bound methods for event listeners to ensure correct 'this' context
    private boundOnDocumentMouseMove: (event: MouseEvent) => void;
    private boundOnDocumentMouseUp: () => void;

    constructor(
        public readonly id: CardID,
        public faceUp: CardFaceUp
    ) {
        this.boundOnDocumentMouseMove = this._onDocumentMouseMove.bind(this);
        this.boundOnDocumentMouseUp = this._onDocumentMouseUp.bind(this);
    }

    toJSON() {
        return {
            id: this.id,
            faceUp: this.faceUp
        };
    }

    flip() {
        this.faceUp = !this.faceUp;
        eventEmitter.emit(EventType.Save);
        return this.faceUp;
    }

    get suit(): Suit {
        return CARD_MAP[this.id].suit;
    }

    get rank(): Rank {
        return CARD_MAP[this.id].rank;
    }

    get color(): SuitColor {
        return SUIT_DATA[this.suit].color;
    }

    get symbol(): SuitSymbol {
        return SUIT_DATA[this.suit].symbol;
    }

    // Public method to be called by CardComponent on mousedown
    public handleInteractionStart(
        event: MouseEvent, // Native MouseEvent from React's SyntheticEvent
        domElement: HTMLDivElement,
        parentCell: Cell
    ): void {
        if (event.button !== 0) return; // Only handle left clicks

        this.interactionState = {
            startX: event.clientX,
            startY: event.clientY,
            isDragging: false,
            potentialClick: true,
            domElement: domElement,
            parentCellContext: parentCell,
        };

        // Add listeners to the document
        document.addEventListener('mousemove', this.boundOnDocumentMouseMove);
        document.addEventListener('mouseup', this.boundOnDocumentMouseUp, { once: true });
    }

    // Private method for document mousemove
    private _onDocumentMouseMove(event: MouseEvent): void {
        if (!this.interactionState.potentialClick || !this.interactionState.domElement || !this.interactionState.parentCellContext) {
            // Not in a state to process move for drag initiation, or critical context missing
            return;
        }

        const dx = Math.abs(event.clientX - this.interactionState.startX);
        const dy = Math.abs(event.clientY - this.interactionState.startY);
        const dragThreshold = 5; // Pixels to move before it's considered a drag

        if (dx > dragThreshold || dy > dragThreshold) {
            this.interactionState.isDragging = true;
            this.interactionState.potentialClick = false; // It's a drag, not a click

            // Call game.initiateDrag, ensuring all parameters are correctly passed
            game.initiateDrag(
                this, // The card instance itself
                this.interactionState.parentCellContext, // The cell this card belongs to
                this.interactionState.domElement,       // The DOM element of the card
                this.interactionState.startX,           // Initial mouse X for correct ghost positioning
                this.interactionState.startY            // Initial mouse Y
            );

            // Once drag is initiated, this specific mousemove listener has done its job for starting the drag.
            // Game's own listeners will handle further ghost card movement.
            document.removeEventListener('mousemove', this.boundOnDocumentMouseMove);
        }
    }

    // Private method for document mouseup
    private _onDocumentMouseUp(): void {
        // Always remove the mousemove listener, in case mouseup occurred before drag threshold was met
        document.removeEventListener('mousemove', this.boundOnDocumentMouseMove);
        // The mouseup listener itself is removed due to { once: true }

        if (this.interactionState.potentialClick && !this.interactionState.isDragging) {
            // If potentialClick is still true and not flagged as dragging, it's a click.
            this.flip(); // This method already emits EventType.Save
        }

        // Reset interaction state for the next interaction
        this.interactionState = {
            startX: 0, startY: 0, isDragging: false, potentialClick: false,
            domElement: null, parentCellContext: null
        };
    }
}

type SerializedCard = Pick<Card, 'id' | 'faceUp'>;
type SerializedCell = { cards: SerializedCard[] };
type SerializedBoard = { cells: SerializedCell[] };

export type Cards = Card[];

export class Cell {
    constructor(
        public cards: Cards = []
    ) { }

    addCard(card: Card) {
        this.cards.push(card);
        eventEmitter.emit(EventType.Save);
    }

    removeCard(card: Card) {
        const index = this.cards.findIndex(c => c.id === card.id);
        if (index !== -1) {
            this.cards.splice(index, 1);
            eventEmitter.emit(EventType.Save);
        }
    }

    clearCards() {
        this.cards = [];
        eventEmitter.emit(EventType.Save);
    }
}

export type Cells = Cell[];

export class Board {
    constructor(
        public readonly cells: Cells = Array.from({ length: TOTAL_BOARD_CELLS }, () => new Cell())
    ) {
        if (cells.length !== TOTAL_BOARD_CELLS) {
            throw new Error(`Board must have exactly ${TOTAL_BOARD_CELLS} cells, got ${cells.length}`);
        }
    }

    getCell(cellIndex: CellIndex): Cell {
        return this.cells[cellIndex];
    }
}

export class Game {
    public board: Board;
    draggedCardData: { card: Card, sourceCell: Cell, ghostElement: HTMLElement | null, initialMouseX: number, initialMouseY: number, cardInitialRect: DOMRect } | null = null;

    constructor() {
        this.board = Game.loadGame();
        eventEmitter.on(EventType.Save, () => this.save());
        this.handleDragMove = this.handleDragMove.bind(this);
        this.handleDragEnd = this.handleDragEnd.bind(this);
    }

    private static loadGame(): Board {
        const savedState = typeof window !== 'undefined' ? localStorage.getItem(GAME_STORAGE_KEY) : null;
        if (!savedState) {
            return Game.createNewBoard();
        }
        const parsed = JSON.parse(savedState) as SerializedBoard;
        const cells = parsed.cells.map(
            cellData => new Cell(cellData.cards.map(c => new Card(c.id, c.faceUp)))
        );
        return new Board(cells);
    }

    private static createNewBoard(): Board {
        const board = new Board();
        board.getCell(DECK_CELL_1).addCard(new Card('AceOfSpades', true));
        return board;
    }

    static create(): Game {
        return new Game();
    }

    private save() {
        if (typeof window !== 'undefined') {
            localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(this.board));
        }
    }

    initiateDrag(card: Card, sourceCell: Cell, cardElement: HTMLElement, clientX: number, clientY: number) {
        if (this.draggedCardData) return;

        const cardInitialRect = cardElement.getBoundingClientRect();
        sourceCell.removeCard(card);

        const ghostElement = cardElement.cloneNode(true) as HTMLElement;
        ghostElement.style.position = 'fixed';
        ghostElement.style.left = `${cardInitialRect.left}px`;
        ghostElement.style.top = `${cardInitialRect.top}px`;
        ghostElement.style.width = `${cardInitialRect.width}px`;
        ghostElement.style.height = `${cardInitialRect.height}px`;
        ghostElement.style.zIndex = '1000';
        ghostElement.style.pointerEvents = 'none';
        ghostElement.style.opacity = '1';
        ghostElement.style.transform = '';

        document.body.appendChild(ghostElement);
        document.body.style.cursor = 'grabbing';

        this.draggedCardData = {
            card,
            sourceCell,
            ghostElement,
            initialMouseX: clientX,
            initialMouseY: clientY,
            cardInitialRect
        };

        document.addEventListener('mousemove', this.handleDragMove);
        document.addEventListener('mouseup', this.handleDragEnd, { once: true });
    }

    handleDragMove(event: MouseEvent) {
        if (!this.draggedCardData || !this.draggedCardData.ghostElement) return;
        event.preventDefault();

        const { ghostElement, initialMouseX, initialMouseY, cardInitialRect } = this.draggedCardData;
        const dx = event.clientX - initialMouseX;
        const dy = event.clientY - initialMouseY;

        ghostElement.style.left = `${cardInitialRect.left + dx}px`;
        ghostElement.style.top = `${cardInitialRect.top + dy}px`;
    }

    handleDragEnd(event: MouseEvent) {
        if (!this.draggedCardData) return;
        event.preventDefault();

        const { card, sourceCell, ghostElement } = this.draggedCardData;

        if (ghostElement) {
            document.body.removeChild(ghostElement);
        }
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', this.handleDragMove);

        let droppedOnCellInstance: Cell | null = null;
        if (ghostElement) ghostElement.style.display = 'none';
        const targetElement = document.elementFromPoint(event.clientX, event.clientY);
        if (ghostElement) ghostElement.style.display = '';

        if (targetElement) {
            const cellElement = targetElement.closest('[data-cell-index]');
            if (cellElement && (cellElement as HTMLElement).dataset.cellIndex) {
                const cellIndexStr = (cellElement as HTMLElement).dataset.cellIndex;
                if (cellIndexStr) {
                    const cellIndex = parseInt(cellIndexStr, 10) as CellIndex;
                    if (!isNaN(cellIndex) && cellIndex >= 0 && cellIndex < this.board.cells.length) {
                        droppedOnCellInstance = this.board.getCell(cellIndex);
                    }
                }
            }
        }

        if (droppedOnCellInstance && droppedOnCellInstance !== sourceCell) {
            droppedOnCellInstance.addCard(card);
        } else {
            sourceCell.addCard(card);
        }

        this.draggedCardData = null;
    }
}

export const game = Game.create();

export function CardComponent({ card, cell }: { card: Card, cell: Cell }) {
    const cardDivRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (cardDivRef.current) {
            // Pass the native browser event to the Card class method
            card.handleInteractionStart(event.nativeEvent, cardDivRef.current, cell);
        }
        // No event.preventDefault() here, allows default browser behavior if needed,
        // though card.handleInteractionStart might call it if it starts a drag.
        // The actual prevention of text selection etc. during drag is better handled by game.initiateDrag if needed.
    };

    return (
        <div
            ref={cardDivRef}
            className={`${styles.card} ${card.faceUp ? styles.faceUp : styles.faceDown}`}
            onMouseDown={handleMouseDown}
            style={{ cursor: 'grab' }}
        >
            {card.faceUp ? (
                <div className={styles.cardContent} style={{ color: card.color }}>
                    <div className={styles.cardRank}>{card.rank}</div>
                    <div className={styles.cardSymbol}>{card.symbol}</div>
                </div>
            ) : (
                <div className={styles.cardBack}>
                    <div className={styles.cardContent} style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <div className={styles.cardRank}>{card.rank}</div>
                        <div className={styles.cardSymbol}>{card.symbol}</div>
                    </div>
                    <div className={styles.cardBackPattern}></div>
                </div>
            )}
        </div>
    );
}

export function CellComponent({ cell, cellIndex }: { cell: Cell, cellIndex: CellIndex }) {
    return (
        <div className={styles.cell} data-cell-index={cellIndex}>
            {cell.cards.map(cardInstance => (
                <CardComponent key={cardInstance.id} card={cardInstance} cell={cell} />
            ))}
        </div>
    );
}

export class BoardComponent extends React.Component<Record<string, never>, { version: number }> {
    constructor(props: Record<string, never>) {
        super(props);
        this.state = { version: 0 };
        this.handleSave = this.handleSave.bind(this);
    }

    private handleSave = () => {
        this.setState(prevState => ({ version: prevState.version + 1 }));
    };

    componentDidMount() {
        eventEmitter.on(EventType.Save, this.handleSave);
    }

    componentWillUnmount() {
        eventEmitter.off(EventType.Save, this.handleSave);
    }

    render() {
        return (
            <>
                <div className={styles.scoreRow}>
                    <span>Player 1 Score: 0</span>
                    <span>Player 2 Score: 0</span>
                </div>
                <div className={styles.board}>
                    {game.board.cells.map((cellInstance: Cell, index: number) => (
                        <CellComponent key={index} cell={cellInstance} cellIndex={index as CellIndex} />
                    ))}
                </div>
            </>
        );
    }
}

