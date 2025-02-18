// src/hooks/useCellDragDrop.ts
import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store';
import { triggerCardDragThunk } from '../features/gameThunks';
import { Card, PlayerEnum } from '../types';

interface UseCellDragDropProps {
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
  const { onDragStart, onDragEnd, clearHighlights, isDisabled, index, card, playerId } = props;
  const dispatch = useDispatch<AppDispatch>();

  const onNativeDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (playerId !== undefined && index !== undefined && card) {
        dispatch(triggerCardDragThunk({ cardIndex: index, playerId }));
      }
      onDragStart && onDragStart();
      e.dataTransfer.setData('text/plain', JSON.stringify({ cardIndex: index, playerId }));
    },
    [dispatch, onDragStart, index, card, playerId]
  );

  const onNativeDragEnd = useCallback(() => {
    onDragEnd && onDragEnd();
    clearHighlights && clearHighlights();
  }, [onDragEnd, clearHighlights]);

  const onNativeDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const onNativeDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, dropHandler: (dragData: DragData) => void) => {
      e.preventDefault();
      if (isDisabled) return;
      try {
        const dragData: DragData = JSON.parse(e.dataTransfer.getData('text/plain'));
        dropHandler(dragData);
      } catch (err) {
        console.error(err);
      } finally {
        clearHighlights && clearHighlights();
      }
    },
    [isDisabled, clearHighlights]
  );

  return { onNativeDragStart, onNativeDragEnd, onNativeDragOver, onNativeDrop };
};
