"use client"
import React, { useState, useEffect } from 'react';
import io from "socket.io-client";

export default function TicTacToe() {
    const [board, setBoard] = useState(Array(9).fill(null));
    const [xIsNext, setXIsNext] = useState(true);
    const [gameOver, setGameOver] = useState(false);
    const [winner, setWinner] = useState(null);
    const [showPopup, setShowPopup] = useState(false);
    const [showGameOver, setShowGameOver] = useState(false);
    const [socket, setSocket] = useState(null);
    const [playerSymbol, setPlayerSymbol] = useState(null);
    const [isYourTurn, setIsYourTurn] = useState(false);
    const [waitingForPlayer, setWaitingForPlayer] = useState(true);
    const [connectedPlayers, setConnectedPlayers] = useState(0);
    const [roomId, setRoomId] = useState(null);
    const [opponentLeft, setOpponentLeft] = useState(false);

    useEffect(() => {
        // Initialize socket connection
        const newSocket = io("https://webgamebackend.onrender.com", {
            transports: ["websocket"]
        });

        setSocket(newSocket);

        // Cleanup on component unmount
        return () => {
            newSocket.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!socket) return;

        // Listen for player assignment
        socket.on("player-assigned", ({ symbol, players, roomId }) => {
            setPlayerSymbol(symbol);
            setIsYourTurn(symbol === 'X');
            setConnectedPlayers(players);
            setRoomId(roomId);
            if (players === 2) {
                setWaitingForPlayer(false);
                setOpponentLeft(false);
            }
        });

        // Listen for game state synchronization
        socket.on("sync-game-state", ({ board, currentTurn, gameOver }) => {
            setBoard(board);
            setXIsNext(currentTurn === 'X');
            setIsYourTurn(currentTurn === playerSymbol);
            setGameOver(gameOver);
        });

        // Listen for player count updates
        socket.on("player-count", (count) => {
            setConnectedPlayers(count);
            setWaitingForPlayer(count < 2);
        });

        // Listen for move from the other player
        socket.on("move-made", ({ index, symbol }) => {
            setBoard(prevBoard => {
                const newBoard = [...prevBoard];
                newBoard[index] = symbol;
                return newBoard;
            });

            // Check for winner after opponent's move
            const newBoard = [...board];
            newBoard[index] = symbol;
            
            const gameWinner = calculateWinner(newBoard);
            if (gameWinner) {
                setGameOver(true);
                setWinner(gameWinner);
                setShowPopup(true);
                socket.emit("game-over", { winner: gameWinner });
            } else if (!newBoard.includes(null)) {
                setGameOver(true);
                setWinner('Draw');
                setShowPopup(true);
                socket.emit("game-over", { winner: 'Draw' });
            } else {
                setXIsNext(symbol === 'O'); // Toggle turn
                setIsYourTurn(symbol !== playerSymbol); // It's your turn if the last move wasn't yours
            }
        });

        // Listen for opponent leaving
        socket.on("opponent-left", () => {
            setWaitingForPlayer(true);
            setOpponentLeft(true);
        });

        // Listen for game reset
        socket.on("game-reset", () => {
            resetGameState();
        });

        return () => {
            socket.off("player-assigned");
            socket.off("sync-game-state");
            socket.off("player-count");
            socket.off("move-made");
            socket.off("game-reset");
            socket.off("opponent-left");
        };
    }, [socket, board, playerSymbol]);

    const handleClick = (index) => {
        // Check if the move is valid
        if (board[index] || gameOver || !isYourTurn || waitingForPlayer) return;

        const currentSymbol = xIsNext ? 'X' : 'O';
        
        // Only allow move if it's your symbol's turn
        if (playerSymbol !== currentSymbol) return;

        // Make the move locally
        const newBoard = [...board];
        newBoard[index] = currentSymbol;
        setBoard(newBoard);
        
        // Send the move to server
        socket.emit("clicked-square", { index, symbol: currentSymbol });
        
        // Check for winner
        const gameWinner = calculateWinner(newBoard);
        if (gameWinner) {
            setGameOver(true);
            setWinner(gameWinner);
            setShowPopup(true);
            socket.emit("game-over", { winner: gameWinner });
        } else if (!newBoard.includes(null)) {
            setGameOver(true);
            setWinner('Draw');
            setShowPopup(true);
            socket.emit("game-over", { winner: 'Draw' });
        } else {
            setXIsNext(!xIsNext);
            setIsYourTurn(false); // No longer your turn after making a move
        }
    };

    const calculateWinner = (squares) => {
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
            [0, 4, 8], [2, 4, 6]             // diagonals
        ];

        for (let i = 0; i < lines.length; i++) {
            const [a, b, c] = lines[i];
            if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
                return squares[a];
            }
        }
        return null;
    };

    const resetGameState = () => {
        setBoard(Array(9).fill(null));
        setXIsNext(true);
        setGameOver(false);
        setWinner(null);
        setShowPopup(false);
        setShowGameOver(false);
        setIsYourTurn(playerSymbol === 'X');
    };

    const resetGame = () => {
        resetGameState();
        // Notify other players about the reset
        if (socket) {
            socket.emit("reset-game");
        }
    };

    const findNewGame = () => {
        if (socket) {
            resetGameState();
            socket.emit("leave-game");
        }
    };

    const closePopup = () => {
        setShowPopup(false);
        setShowGameOver(true);
    };

    const renderSquare = (index) => {
        return (
            <div
                onClick={() => handleClick(index)}
                className={`border-2 border-amber-400 flex items-center justify-center transition-all duration-300
                ${board[index] === 'X' ? 'bg-blue-100' : board[index] === 'O' ? 'bg-red-100' : 
                (isYourTurn && !gameOver && !board[index]) ? 'hover:bg-amber-50 cursor-pointer' : ''}
                w-20 h-20 md:w-24 md:h-24 lg:w-32 lg:h-32 text-4xl md:text-5xl lg:text-6xl font-bold`}
            >
                {board[index] === 'X' && <span className="text-blue-600">X</span>}
                {board[index] === 'O' && <span className="text-red-600">O</span>}
            </div>
        );
    };

    const getStatusMessage = () => {
        if (waitingForPlayer) {
            return opponentLeft 
                ? "Your opponent left. Waiting for a new player..." 
                : "Waiting for another player to join...";
        }
        
        if (gameOver) {
            return null;
        }
        
        if (isYourTurn) {
            return `Your turn (${playerSymbol})`;
        } else {
            return `Opponent's turn (${playerSymbol === 'X' ? 'O' : 'X'})`;
        }
    };

    return (
        <div className="flex justify-center items-center min-h-screen bg-amber-50 p-4 relative">
            <div className="flex flex-col items-center gap-6 relative">
                <h1 className="text-3xl md:text-4xl font-bold text-amber-800">Tic-Tac-Toe</h1>
                
                <div className="bg-white px-4 py-2 rounded-lg text-center">
                    <p className="text-lg font-medium">
                        {playerSymbol ? `You are Player ${playerSymbol}` : 'Connecting...'}
                    </p>
                    <p className="text-sm text-gray-600">
                        {connectedPlayers}/2 players connected
                    </p>
                    {roomId && (
                        <p className="text-xs text-gray-500">
                            Game Room: {roomId}
                        </p>
                    )}
                </div>

                <div className={`bg-white p-4 rounded-lg shadow-lg relative ${waitingForPlayer ? 'opacity-70' : ''}`}>
                    {getStatusMessage() && (
                        <div className="mb-4 text-xl font-medium text-center text-amber-700">
                            {getStatusMessage()}
                        </div>
                    )}

                    <div className="border-2 border-amber-600 rounded-md overflow-hidden relative">
                        <div className="flex">
                            {renderSquare(0)}
                            {renderSquare(1)}
                            {renderSquare(2)}
                        </div>
                        <div className="flex">
                            {renderSquare(3)}
                            {renderSquare(4)}
                            {renderSquare(5)}
                        </div>
                        <div className="flex">
                            {renderSquare(6)}
                            {renderSquare(7)}
                            {renderSquare(8)}
                        </div>
                        
                        {/* Waiting overlay */}
                        {waitingForPlayer && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 backdrop-filter backdrop-blur-sm z-10">
                                <div className="bg-white p-4 rounded-lg shadow-md text-center">
                                    <p className="text-lg font-medium mb-2">
                                        {opponentLeft 
                                            ? "Your opponent left. Waiting for a new player..." 
                                            : "Waiting for opponent..."}
                                    </p>
                                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-600 border-t-transparent mx-auto"></div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-blue-600 rounded-full"></div>
                        <span className="font-medium">Player X</span>
                        {playerSymbol === 'X' && <span className="text-xs bg-blue-100 px-2 py-0.5 rounded-full">You</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-red-600 rounded-full"></div>
                        <span className="font-medium">Player O</span>
                        {playerSymbol === 'O' && <span className="text-xs bg-red-100 px-2 py-0.5 rounded-full">You</span>}
                    </div>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={resetGame}
                        className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
                        disabled={waitingForPlayer}
                    >
                        Reset Game
                    </button>
                    <button
                        onClick={findNewGame}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                        Find New Game
                    </button>
                </div>

                {/* Game Over Overlay */}
                {showGameOver && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 bg-black bg-opacity-50 text-white p-4 rounded-lg text-center shadow-lg backdrop-filter backdrop-blur-sm">
                        <p className="text-xl text-white">
                            <span className="font-bold">GAME OVER:</span> {winner === 'Draw' ? "It's a Draw!" : `Player ${winner} Wins!`}
                        </p>
                    </div>
                )}
            </div>

            {/* Winner Popup */}
            {showPopup && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
                    <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md text-center">
                        {winner === 'Draw' ? (
                            <>
                                <h2 className="text-3xl font-bold mb-4 text-amber-800">Its a Draw!</h2>
                                <p className="mb-6 text-lg">Well played by both players!</p>
                            </>
                        ) : (
                            <>
                                <h2 className="text-3xl font-bold mb-4 text-amber-800">
                                    {winner === playerSymbol ? 'Congratulations!' : 'Game Over!'}
                                </h2>
                                <div className={`text-6xl mb-4 ${winner === 'X' ? 'text-blue-600' : 'text-red-600'}`}>
                                    {winner}
                                </div>
                                <p className="mb-6 text-lg">
                                    {winner === playerSymbol ? 'You won the game!' : 'Your opponent won the game!'}
                                </p>
                            </>
                        )}
                        <div className="flex justify-center gap-4">
                            <button
                                onClick={closePopup}
                                className="px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                Close
                            </button>
                            <button
                                onClick={resetGame}
                                className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                            >
                                Play Again
                            </button>
                            <button
                                onClick={findNewGame}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                New Game
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}