import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from './features/game';
import App from './App';

test('renders the game board', () => {
  const store = configureStore({
    reducer: {
      game: gameReducer
    }
  });

  const { container } = render(
    <Provider store={store}>
      <App />
    </Provider>
  );
  
  const boardElement = container.getElementsByClassName('board')[0];
  expect(boardElement).toBeInTheDocument();
});
