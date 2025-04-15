const express = require('express');
const http = require('http');
const app = new express();
const server = http.createServer(app);
const cors = require("cors");
const dotenv = require("dotenv");

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

dotenv.config();

const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
  },
});

// Game state management
const gameRooms = new Map(); // Map to store all active game rooms
const playerToRoom = new Map(); // Map to track which room a player is in

// Generate a unique room ID
function generateRoomId() {
  return 'game_' + Math.random().toString(36).substring(2, 9);
}

// Find an available game room or create a new one
function findAvailableRoom() {
  // Look for a room with one player
  for (const [roomId, room] of gameRooms.entries()) {
    if (room.players.length === 1) {
      return roomId;
    }
  }
  
  // Create a new room if all existing rooms are full
  const roomId = generateRoomId();
  gameRooms.set(roomId, {
    players: [],
    board: Array(9).fill(null),
    currentTurn: 'X',
    gameOver: false
  });
  return roomId;
}

server.listen(9000, () => console.log("Server Started on port 9000"));

io.on("connection", socket => {
  console.log(`A user connected: ${socket.id}`);
  
  // Find an available room for the player
  const roomId = findAvailableRoom();
  const room = gameRooms.get(roomId);
  
  // Add player to the room
  const playerSymbol = room.players.length === 0 ? 'X' : 'O';
  room.players.push({
    id: socket.id,
    symbol: playerSymbol
  });
  
  // Track which room this player is in
  playerToRoom.set(socket.id, roomId);
  
  // Join the socket room
  socket.join(roomId);
  
  // Notify player of their assignment and room
  socket.emit("player-assigned", { 
    symbol: playerSymbol,
    players: room.players.length,
    roomId: roomId
  });
  
  // If this player just joined a game in progress, sync the game state
  if (room.players.length === 2 && !room.board.every(cell => cell === null)) {
    socket.emit("sync-game-state", {
      board: room.board,
      currentTurn: room.currentTurn,
      gameOver: room.gameOver
    });
  }
  
  // Notify all clients in the room of player count
  io.to(roomId).emit("player-count", room.players.length);
  
  // Handle a player's move
  socket.on("clicked-square", ({ index, symbol }) => {
    const playerRoomId = playerToRoom.get(socket.id);
    if (!playerRoomId) return;
    
    const gameRoom = gameRooms.get(playerRoomId);
    if (!gameRoom) return;
    
    // Update board state in server memory
    gameRoom.board[index] = symbol;
    gameRoom.currentTurn = symbol === 'X' ? 'O' : 'X';
    
    // Broadcast move to all clients in the room
    io.to(playerRoomId).emit("move-made", { index, symbol });
  });
  
  // Handle game reset
  socket.on("reset-game", () => {
    const playerRoomId = playerToRoom.get(socket.id);
    if (!playerRoomId) return;
    
    const gameRoom = gameRooms.get(playerRoomId);
    if (!gameRoom) return;
    
    // Reset board state
    gameRoom.board = Array(9).fill(null);
    gameRoom.currentTurn = 'X';
    gameRoom.gameOver = false;
    
    // Notify all clients in the room
    io.to(playerRoomId).emit("game-reset");
  });
  
  // Handle game completion
  socket.on("game-over", ({ winner }) => {
    const playerRoomId = playerToRoom.get(socket.id);
    if (!playerRoomId) return;
    
    const gameRoom = gameRooms.get(playerRoomId);
    if (!gameRoom) return;
    
    gameRoom.gameOver = true;
  });
  
  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`A user disconnected: ${socket.id}`);
    
    // Get the room this player was in
    const playerRoomId = playerToRoom.get(socket.id);
    if (!playerRoomId) return;
    
    const gameRoom = gameRooms.get(playerRoomId);
    if (!gameRoom) return;
    
    // Remove player from the room
    const playerIndex = gameRoom.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      gameRoom.players.splice(playerIndex, 1);
      
      // Delete empty rooms
      if (gameRoom.players.length === 0) {
        gameRooms.delete(playerRoomId);
      } else {
        // Notify remaining clients of player departure
        io.to(playerRoomId).emit("player-count", gameRoom.players.length);
        io.to(playerRoomId).emit("opponent-left");
      }
    }
    
    // Remove player tracking
    playerToRoom.delete(socket.id);
  });
  
  // Player voluntarily leaves a game to find a new one
  socket.on("leave-game", () => {
    const currentRoomId = playerToRoom.get(socket.id);
    if (!currentRoomId) return;
    
    const currentRoom = gameRooms.get(currentRoomId);
    if (!currentRoom) return;
    
    // Leave the current room
    socket.leave(currentRoomId);
    
    // Remove player from the room
    const playerIndex = currentRoom.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      currentRoom.players.splice(playerIndex, 1);
      
      // Delete empty rooms
      if (currentRoom.players.length === 0) {
        gameRooms.delete(currentRoomId);
      } else {
        // Notify remaining clients of player departure
        io.to(currentRoomId).emit("player-count", currentRoom.players.length);
        io.to(currentRoomId).emit("opponent-left");
      }
    }
    
    // Remove player tracking
    playerToRoom.delete(socket.id);
    
    // Find a new room for the player
    const newRoomId = findAvailableRoom();
    const newRoom = gameRooms.get(newRoomId);
    
    // Add player to the new room
    const playerSymbol = newRoom.players.length === 0 ? 'X' : 'O';
    newRoom.players.push({
      id: socket.id,
      symbol: playerSymbol
    });
    
    // Track which room this player is in
    playerToRoom.set(socket.id, newRoomId);
    
    // Join the socket room
    socket.join(newRoomId);
    
    // Notify player of their assignment and new room
    socket.emit("player-assigned", { 
      symbol: playerSymbol,
      players: newRoom.players.length,
      roomId: newRoomId
    });
    
    // If this player just joined a game in progress, sync the game state
    if (newRoom.players.length === 2 && !newRoom.board.every(cell => cell === null)) {
      socket.emit("sync-game-state", {
        board: newRoom.board,
        currentTurn: newRoom.currentTurn,
        gameOver: newRoom.gameOver
      });
    }
    
    // Notify all clients in the room of player count
    io.to(newRoomId).emit("player-count", newRoom.players.length);
  });
});

app.get("/", (req, res) => {
  res.send("🚀 Tic-Tac-Toe server is up and running with multiple game room support!");
});

// Endpoint to get current game stats
app.get("/stats", (req, res) => {
  const stats = {
    activeGames: gameRooms.size,
    totalPlayers: playerToRoom.size,
    rooms: Array.from(gameRooms.entries()).map(([id, room]) => ({
      id,
      players: room.players.length,
      gameInProgress: !room.board.every(cell => cell === null)
    }))
  };
  res.json(stats);
});