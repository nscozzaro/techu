// src/hooks/useCellDragDrop.ts
import { useCallback } from 'react';
import { Card, PlayerEnum } from '../types';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store';
import { triggerCardDragThunk } from '../features/gameThunks';

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
      if (onDragStart) onDragStart();
      e.dataTransfer.setData('text/plain', JSON.stringify({ cardIndex: index, playerId }));
    },
    [dispatch, onDragStart, index, card, playerId]
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
