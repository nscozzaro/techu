// src/hooks/useCellDragDrop.ts
import { useCallback } from 'react';
import { Card, PlayerEnum } from '../types';

interface UseCellDragDropProps {
  handleCardDrag?: (cardIndex: number, playerId: PlayerEnum) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  clearHighlights?: () => void;
  isDisabled?: boolean;
  index?: number;
  card?: Card;
  playerId?: PlayerEnum;
}

interface DragData {
  cardIndex: number;
  playerId: PlayerEnum;
}

export const useCellDragDrop = (props: UseCellDragDropProps) => {
  const { handleCardDrag, onDragStart, onDragEnd, clearHighlights, isDisabled, index, card, playerId } = props;

  const onNativeDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (handleCardDrag && playerId !== undefined && index !== undefined && card) {
        handleCardDrag(index, playerId);
      }
      if (onDragStart) onDragStart();
      e.dataTransfer.setData('text/plain', JSON.stringify({ cardIndex: index, playerId }));
    },
    [handleCardDrag, onDragStart, index, card, playerId]
  );

  const onNativeDragEnd = useCallback(() => {
    if (onDragEnd) onDragEnd();
    if (clearHighlights) clearHighlights();
  }, [onDragEnd, clearHighlights]);

  const onNativeDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const onNativeDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, dropHandler: (dragData: DragData) => void) => {
      e.preventDefault();
      try {
        const dragData: DragData = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (isDisabled) return;
        dropHandler(dragData);
      } catch (err) {
        console.error(err);
      } finally {
        if (clearHighlights) clearHighlights();
      }
    },
    [isDisabled, clearHighlights]
  );

  return { onNativeDragStart, onNativeDragEnd, onNativeDragOver, onNativeDrop };
};
