import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store';
import { triggerCardDrag, setHighlightedCells } from '../features/game';
import { Card, PlayerEnum } from '../types';

interface UseCellDragDropProps {
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isDisabled?: boolean;
  index?: number;
  card?: Card | null;
  playerId?: PlayerEnum;
}

interface DragData {
  cardIndex: number;
  playerId: PlayerEnum;
}

export const useCellDragDrop = (props: UseCellDragDropProps) => {
  const { onDragStart, onDragEnd, isDisabled, index, card, playerId } = props;
  const dispatch = useDispatch<AppDispatch>();

  const onNativeDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (playerId !== undefined && index !== undefined && card) {
      dispatch(triggerCardDrag({ cardIndex: index, playerId }));
    }
    onDragStart && onDragStart();
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ cardIndex: index, playerId })
    );
  };

  const onNativeDragEnd = () => {
    onDragEnd && onDragEnd();
    // Directly clear highlights in Redux, no separate callback
    dispatch(setHighlightedCells([]));
  };

  const onNativeDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const onNativeDrop = (
    e: React.DragEvent<HTMLDivElement>,
    dropHandler: (dragData: DragData) => void
  ) => {
    e.preventDefault();
    if (isDisabled) return;
    try {
      const dragData: DragData = JSON.parse(
        e.dataTransfer.getData('text/plain')
      );
      dropHandler(dragData);
    } catch (err) {
      console.error(err);
    } finally {
      // Directly clear highlights in Redux
      dispatch(setHighlightedCells([]));
    }
  };

  return {
    onNativeDragStart,
    onNativeDragEnd,
    onNativeDragOver,
    onNativeDrop,
  };
};
