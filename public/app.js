document.addEventListener("DOMContentLoaded", () => {
  const board = document.getElementById("game-board");
  const handContainer = document.createElement("div");
  handContainer.classList.add("hand");

  const boardSize = 5;
  const playerHomeRow = boardSize * (boardSize - 1) + Math.floor(boardSize / 2);
  const botHomeRow = Math.floor(boardSize / 2);
  let playerDeck = [];
  let botDeck = [];
  let playerHand = [null, null, null];
  let botHand = [null, null, null];
  let playerTurn = true;
  let isFirstMove = true;
  let isBotFirstMove = true;

  function initializeBoard() {
    board.innerHTML = "";
    for (let i = 0; i < boardSize * boardSize; i++) {
      const cell = document.createElement("div");
      cell.classList.add("cell");
      cell.dataset.index = i;
      cell.addEventListener("dragover", allowDrop);
      cell.addEventListener("drop", (event) => dropCard(event, i));
      board.appendChild(cell);
    }
  }

  function drawCard(deck, hand) {
    const emptySlot = hand.findIndex((slot) => slot === null);
    if (deck.length > 0 && emptySlot !== -1) {
      hand[emptySlot] = deck.pop();
      updateHandDisplay();
    }
  }

  function updateHandDisplay() {
    handContainer.innerHTML = "";
    playerHand.forEach((card, index) => {
      const cardSlot = createCardSlot(card, index);
      handContainer.appendChild(cardSlot);
    });
  }

  function createCardSlot(card, index) {
    const cardSlot = document.createElement("div");
    cardSlot.classList.add("card-slot");
    cardSlot.setAttribute("draggable", "true");
    cardSlot.dataset.index = index;

    if (card) {
      cardSlot.textContent = `${card.rank} ${card.suit}`;
      cardSlot.classList.add(card.color === "red" ? "red" : "black");
      cardSlot.addEventListener("dragstart", (event) => dragCard(event, index));
      cardSlot.addEventListener("dragend", clearHighlights);
    }
    return cardSlot;
  }

  function dragCard(event, index) {
    if (playerTurn) {
      event.dataTransfer.setData("cardIndex", index);
      highlightValidSpaces();
    }
  }

  function allowDrop(event) {
    event.preventDefault();
  }

  function dropCard(event, boardIndex) {
    if (!playerTurn) return;
    event.preventDefault();

    const cardIndex = event.dataTransfer.getData("cardIndex");

    if (cardIndex !== null && playerHand[cardIndex]) {
      const cell = board.querySelector(`[data-index='${boardIndex}']`);
      if (!cell.classList.contains("highlight")) return;

      placeCardOnBoard(cell, cardIndex);
      endPlayerTurn();
    }
  }

  function placeCardOnBoard(cell, cardIndex) {
    const selectedCard = playerHand[cardIndex];
    cell.classList.remove("red", "black");
    cell.textContent = `${selectedCard.rank} ${selectedCard.suit}`;
    cell.classList.add("card-played", selectedCard.color);
    playerHand[cardIndex] = null;
    updateHandDisplay();
    clearHighlights();
  }

  function endPlayerTurn() {
    isFirstMove = false;
    playerTurn = false;
    drawCard(playerDeck, playerHand);
    checkEndGame();
    if (playerDeck.length === 0 && playerHand.every((card) => card === null)) {
      botPlay();
    } else {
      botPlay();
    }
  }

  function highlightValidSpaces() {
    const cells = board.querySelectorAll(".cell");
    clearCellHighlights(cells);

    if (isFirstMove) {
      highlightFirstMoveCell();
      return;
    }

    const { selectedCard, selectedCardRank, opponentColor } = getSelectedCardInfo();

    highlightHomeRowOpenSpots();
    const connectedCells = findConnectedCellsToHomeRow("player");
    highlightValidAdjacentCells(connectedCells, selectedCardRank, opponentColor, cells);
  }

  function clearCellHighlights(cells) {
    cells.forEach((cell) => cell.classList.remove("highlight"));
  }

  function highlightFirstMoveCell() {
    const firstMoveCell = board.querySelector(`[data-index='${playerHomeRow}']`);
    firstMoveCell.classList.add("highlight");
  }

  function getSelectedCardInfo() {
    const cardIndex = event.dataTransfer.getData("cardIndex");
    const selectedCard = playerHand[cardIndex];
    const selectedCardRank = getCardRank(selectedCard.rank);
    const opponentColor = selectedCard.color === "red" ? "black" : "red";
    return { selectedCard, selectedCardRank, opponentColor };
  }

  function highlightHomeRowOpenSpots() {
    for (let i = boardSize * (boardSize - 1); i < boardSize * boardSize; i++) {
      const homeRowCell = board.querySelector(`[data-index='${i}']`);
      if (!homeRowCell.textContent) {
        homeRowCell.classList.add("highlight");
      }
    }
  }

  function highlightValidAdjacentCells(connectedCells, selectedCardRank, opponentColor, cells) {
    connectedCells.forEach((cell) => {
      const index = parseInt(cell.dataset.index);
      const adjacentIndices = getAdjacentIndices(index);

      adjacentIndices.forEach((adjIndex) => {
        if (adjIndex >= 0 && adjIndex < boardSize * boardSize) {
          const adjacentCell = cells[adjIndex];
          if (!adjacentCell.textContent) {
            adjacentCell.classList.add("highlight");
          } else {
            const cellText = adjacentCell.textContent;
            const opponentCardRank = getCardRank(cellText.split(" ")[0]);

            if (
              adjacentCell.classList.contains(opponentColor) &&
              opponentCardRank < selectedCardRank
            ) {
              adjacentCell.classList.add("highlight");
            }
          }
        }
      });
    });
  }

  function getAdjacentIndices(index) {
    return [
      index - 1,
      index + 1,
      index - boardSize,
      index + boardSize,
    ];
  }

  function findConnectedCellsToHomeRow(playerType) {
    const cells = board.querySelectorAll(".cell");
    const visited = new Set();
    const queue = [];

    const { homeRowStart, homeRowEnd } = getHomeRowIndices(playerType);
    const colors = getPlayerColors(playerType);

    addOccupiedHomeRowCellsToQueue(queue, visited, cells, homeRowStart, homeRowEnd, colors);
    performBFS(queue, visited, cells, colors);

    return Array.from(visited).map((index) => cells[index]);
  }

  function getHomeRowIndices(playerType) {
    if (playerType === "player") {
      return { homeRowStart: boardSize * (boardSize - 1), homeRowEnd: boardSize * boardSize };
    } else {
      return { homeRowStart: 0, homeRowEnd: boardSize };
    }
  }

  function getPlayerColors(playerType) {
    return playerType === "player" ? ["♥", "♦"] : ["♠", "♣"];
  }

  function addOccupiedHomeRowCellsToQueue(queue, visited, cells, homeRowStart, homeRowEnd, colors) {
    for (let i = homeRowStart; i < homeRowEnd; i++) {
      const cell = cells[i];
      if (cell.textContent && (cell.textContent.includes(colors[0]) || cell.textContent.includes(colors[1]))) {
        queue.push(cell);
        visited.add(i);
      }
    }
  }

  function performBFS(queue, visited, cells, colors) {
    while (queue.length > 0) {
      const currentCell = queue.shift();
      const index = parseInt(currentCell.dataset.index);
      const adjacentIndices = getAdjacentIndices(index);

      processAdjacentCells(adjacentIndices, visited, cells, colors, queue);
    }
  }

  function processAdjacentCells(adjacentIndices, visited, cells, colors, queue) {
    adjacentIndices.forEach((adjIndex) => {
      if (
        adjIndex >= 0 &&
        adjIndex < boardSize * boardSize &&
        !visited.has(adjIndex)
      ) {
        const adjacentCell = cells[adjIndex];
        if (
          adjacentCell.textContent &&
          (adjacentCell.textContent.includes(colors[0]) || adjacentCell.textContent.includes(colors[1]))
        ) {
          queue.push(adjacentCell);
          visited.add(adjIndex);
        }
      }
    });
  }

  function getCardRank(rank) {
    const rankOrder = {
      "2": 2,
      "3": 3,
      "4": 4,
      "5": 5,
      "6": 6,
      "7": 7,
      "8": 8,
      "9": 9,
      "10": 10,
      "J": 11,
      "Q": 12,
      "K": 13,
      "A": 14,
    };
    return rankOrder[rank];
  }

  function clearHighlights() {
    const cells = board.querySelectorAll(".cell");
    cells.forEach((cell) => cell.classList.remove("highlight"));
  }

  function botPlay() {
    drawCard(botDeck, botHand);

    if (isBotFirstMove) {
      handleBotFirstMove();
      return;
    }

    const validMoves = getBotValidMoves();

    if (validMoves.length > 0) {
      executeBotMove(validMoves);
    }

    endBotTurn();
  }

  function handleBotFirstMove() {
    const botFirstMoveCell = board.querySelector(`[data-index='${botHomeRow}']`);
    const botCardIndex = botHand.findIndex((card) => card !== null);
    if (botCardIndex !== -1) {
      const botCard = botHand[botCardIndex];
      placeBotCardOnCell(botFirstMoveCell, botCard);
      botHand[botCardIndex] = null;
    }
    isBotFirstMove = false;
    playerTurn = true;
    drawCard(playerDeck, playerHand);
  }

  function placeBotCardOnCell(cell, card) {
    cell.textContent = `${card.rank} ${card.suit}`;
    cell.classList.add("card-played", card.color === "red" ? "red" : "black");
  }

  function getBotValidMoves() {
    const connectedCells = findConnectedCellsToHomeRow("bot");
    const validMoves = [];
    const cells = board.querySelectorAll(".cell");

    connectedCells.forEach((cell) => {
      const index = parseInt(cell.dataset.index);
      const adjacentIndices = getAdjacentIndices(index);

      adjacentIndices.forEach((adjIndex) => {
        if (adjIndex >= 0 && adjIndex < boardSize * boardSize) {
          const adjacentCell = cells[adjIndex];
          const botCardIndex = botHand.findIndex((card) => card !== null);

          if (botCardIndex !== -1) {
            const botCard = botHand[botCardIndex];
            const botCardRank = getCardRank(botCard.rank);

            if (!adjacentCell.textContent) {
              validMoves.push({ cellIndex: adjIndex, cardIndex: botCardIndex });
            } else {
              const cellText = adjacentCell.textContent;
              const opponentCardRank = getCardRank(cellText.split(" ")[0]);

              if (
                (cellText.includes("♥") || cellText.includes("♦")) &&
                opponentCardRank < botCardRank
              ) {
                validMoves.push({ cellIndex: adjIndex, cardIndex: botCardIndex });
              }
            }
          }
        }
      });
    });

    return validMoves;
  }

  function executeBotMove(validMoves) {
    const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
    const cell = board.querySelector(`[data-index='${randomMove.cellIndex}']`);
    const card = botHand[randomMove.cardIndex];

    placeBotCardOnCell(cell, card);
    botHand[randomMove.cardIndex] = null;
  }

  function endBotTurn() {
    playerTurn = true;
    drawCard(playerDeck, playerHand);
    checkEndGame();
  }

  function checkEndGame() {
    if (
      playerDeck.length === 0 &&
      botDeck.length === 0 &&
      playerHand.every((card) => card === null) &&
      botHand.every((card) => card === null)
    ) {
      determineWinner();
    }
  }

  function determineWinner() {
    const cells = board.querySelectorAll(".cell");
    let playerCount = 0;
    let botCount = 0;

    cells.forEach((cell) => {
      if (cell.classList.contains("red")) {
        playerCount++;
      } else if (cell.classList.contains("black")) {
        botCount++;
      }
    });

    if (playerCount > botCount) {
      alert("Player wins!");
    } else if (botCount > playerCount) {
      alert("Bot wins!");
    } else {
      alert("It's a tie!");
    }
  }

  function startGame() {
    playerDeck = createDeck("red");
    botDeck = createDeck("black");

    shuffle(playerDeck);
    shuffle(botDeck);

    drawCard(playerDeck, playerHand);
    drawCard(playerDeck, playerHand);
    drawCard(playerDeck, playerHand);
    drawCard(botDeck, botHand);
    drawCard(botDeck, botHand);
    drawCard(botDeck, botHand);

    updateHandDisplay();
  }

  function createDeck(color) {
    const suits = color === "red" ? ["♥", "♦"] : ["♣", "♠"];
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    return suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank, color })));
  }

  function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  document.body.appendChild(handContainer);
  initializeBoard();
  startGame();
});
