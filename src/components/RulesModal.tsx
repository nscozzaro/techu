// src/components/RulesModal.tsx

import React, { useState, useEffect } from 'react';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Slide {
  title: string;
  content: React.ReactNode;
}

const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  const slides: Slide[] = [
    {
      title: 'Welcome to the Daily Techu Puzzle!',
      content: (
        <>
          <p>Everyone gets the same shuffle, so you can compare your results with others.</p>
          <p>A new puzzle is released daily at midnight.</p>
        </>
      ),
    },
    {
      title: 'What is Techu?',
      content: (
        <>
          <p>Techu is a 2-player card game played on a 5×5 grid, using a standard deck. Aces are high.</p>
          <p>You will play as red, and your opponent will be black. The goal is to control more spaces than your opponent by the end of the game.</p>
        </>
      ),
    },
    {
      title: 'How to Begin',
      content: (
        <>
          <p>
            Both players place one card in the center of their home row (the row closest to you).
          </p>
          <p>
            The player with the lower-ranked card goes first. If tied, draw again and play on the home row until someone has the lower card.
          </p>
        </>
      ),
    },
    {
      title: 'Your Turn',
      content: (
        <>
          <p>Play a card on the board, or discard it if you can't play.</p>
          <h3>Placement Rules:</h3>
          <ul>
            <li>Higher cards can be played over lower cards.</li>
            <li>
              Your card must connect back to your home row (vertically or horizontally, not diagonally).
            </li>
          </ul>
        </>
      ),
    },
    {
      title: 'How to Win',
      content: (
        <>
          <p>The game ends when both players run out of cards.</p>
          <p>The player controlling the most spaces wins.</p>
        </>
      ),
    },
    {
      title: 'Learn More',
      content: (
        <>
          <p>
            Video tutorial:{' '}
            <a href="https://www.youtube.com/watch?v=lPL5LN9u-rg&t=4s" target="_blank" rel="noopener noreferrer">
              Video Tutorial
            </a>
          </p>
          <p>
            Join the community on Discord:{' '}
            <a href="[Insert Link]" target="_blank" rel="noopener noreferrer">
              Discord Community
            </a>
          </p>
          <p>Download the app to keep playing:{' '}
            <a href="http://www.techu.app" target="_blank" rel="noopener noreferrer">
              Techu.app
            </a>
          </p>
        </>
      ),
    },
  ];

  const [currentSlide, setCurrentSlide] = useState(0);

  // Reset to the first slide whenever the modal is opened
  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
    }
  }, [isOpen]);

  const goToNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide((prev) => prev + 1);
    }
  };

  const goToPrevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content rules-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="close-btn" aria-label="Close">
          &times;
        </button>
        <h2>{slides[currentSlide].title}</h2>
        <div className="slide-content">{slides[currentSlide].content}</div>

        {/* Navigation Buttons */}
        {currentSlide > 0 && (
          <button
            onClick={goToPrevSlide}
            className="nav-btn prev-btn"
            aria-label="Previous Slide"
          >
            &#10094;
          </button>
        )}
        {currentSlide < slides.length - 1 && (
          <button
            onClick={goToNextSlide}
            className="nav-btn next-btn"
            aria-label="Next Slide"
          >
            &#10095;
          </button>
        )}

        {/* Dots Indicator */}
        <div className="dots">
          {slides.map((_, index) => (
            <span
              key={index}
              className={`dot ${index === currentSlide ? 'active' : ''}`}
            ></span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RulesModal;
