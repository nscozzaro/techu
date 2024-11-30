// src/components/AnimatingCard.tsx
import React, { useEffect, useState } from 'react';
import { Card, PlayerEnum } from '../types';
import cardBackRed from '../assets/card-back-red.png';
import cardBackBlue from '../assets/card-back-blue.png';

interface AnimatingCardProps {
  card: Card;
  fromElement: HTMLElement | null;
  toElement: HTMLElement | null;
  containerElement: HTMLElement | null;
}

const AnimatingCard: React.FC<AnimatingCardProps> = ({
  card,
  fromElement,
  toElement,
  containerElement,
}) => {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (fromElement && toElement && containerElement) {
      const fromRect = fromElement.getBoundingClientRect();
      const toRect = toElement.getBoundingClientRect();
      const containerRect = containerElement.getBoundingClientRect();

      const initialLeft = fromRect.left - containerRect.left;
      const initialTop = fromRect.top - containerRect.top;

      const finalLeft = toRect.left - containerRect.left;
      const finalTop = toRect.top - containerRect.top;

      const initialStyle: React.CSSProperties = {
        position: 'absolute',
        width: fromRect.width,
        height: fromRect.height,
        left: initialLeft,
        top: initialTop,
        transition: 'left 1s ease, top 1s ease',
        zIndex: 1000,
      };

      setStyle(initialStyle);

      // Move to the board cell after a short delay
      setTimeout(() => {
        setStyle(prevStyle => ({
          ...prevStyle,
          left: finalLeft,
          top: finalTop,
        }));
      }, 50);
    }
  }, [fromElement, toElement, containerElement]);

  return (
    <div style={style}>
      {card.faceDown ? (
        <div
          className="card-back"
          style={{
            backgroundImage: `url(${card.owner === PlayerEnum.PLAYER1 ? cardBackRed : cardBackBlue})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            width: '100%',
            height: '100%',
          }}
        />
      ) : (
        <div className={`card-content ${card.color.toLowerCase()}`}>
          <div className="top-left">{card.rank}</div>
          <div className="suit">{card.suit}</div>
          <div className="bottom-right">{card.rank}</div>
        </div>
      )}
    </div>
  );
};

export default AnimatingCard;
