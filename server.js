// AK35 Game Server using Node.js, Express, and ws
// Hướng dẫn:
// 1. Đảm bảo bạn đã cài đặt Node.js.
// 2. Chạy `npm install express ws uuid` trong terminal tại thư mục chứa file này.
// 3. Chạy `node server.js` để khởi động server.
// 4. Client (index.html) sẽ kết nối tới server này tại địa chỉ ws://localhost:3000.

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid'); // Sử dụng uuid cho ID người chơi duy nhất

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Lưu trữ trong bộ nhớ cho các phòng và người chơi
const rooms = new Map();
const waitingPlayers = new Map(); // gameId -> ws

// Hàm trợ giúp để tạo ID phòng ngẫu nhiên 6 ký tự
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Hàm trợ giúp để gửi tin nhắn đến tất cả người chơi trong phòng
function broadcast(roomId, message) {
    const room = rooms.get(roomId);
    if (room) {
        room.players.forEach(player => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }
}

wss.on('connection', (ws) => {
    ws.id = uuidv4(); // Gán một ID duy nhất cho mỗi kết nối
    console.log(`Client ${ws.id} đã kết nối.`);

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('Nhận được JSON không hợp lệ:', message);
            return;
        }

        console.log(`Nhận được tin nhắn từ ${ws.id}:`, data);

        switch (data.type) {
            case 'findMatch':
                handleFindMatch(ws, data.gameId);
                break;
            
            case 'createRoom':
                handleCreateRoom(ws, data.gameId);
                break;

            case 'joinRoom':
                handleJoinRoom(ws, data.gameId, data.roomId);
                break;

            case 'move':
                handleMove(ws, data.move);
                break;
        }
    });

    ws.on('close', () => {
        console.log(`Client ${ws.id} đã ngắt kết nối.`);
        // Xử lý việc người chơi ngắt kết nối khỏi phòng hoặc hàng chờ
        const roomId = ws.roomId;
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            // Thông báo cho người chơi còn lại
            const otherPlayer = room.players.find(p => p.id !== ws.id);
            if (otherPlayer && otherPlayer.ws.readyState === WebSocket.OPEN) {
                otherPlayer.ws.send(JSON.stringify({ type: 'opponentDisconnected' }));
            }
            // Dọn dẹp phòng
            rooms.delete(roomId);
            console.log(`Phòng ${roomId} đã đóng do người chơi ngắt kết nối.`);
        }
        // Xóa khỏi hàng chờ nếu có
        for (const [gameId, waitingWs] of waitingPlayers.entries()) {
            if (waitingWs === ws) {
                waitingPlayers.delete(gameId);
                console.log(`Người chơi ${ws.id} đã được xóa khỏi hàng chờ ${gameId}.`);
            }
        }
    });
});

function handleFindMatch(ws, gameId) {
    if (waitingPlayers.has(gameId)) {
        const player1Ws = waitingPlayers.get(gameId);
        waitingPlayers.delete(gameId);
        
        // Tìm thấy trận, tạo phòng và bắt đầu game
        const roomId = generateRoomId();
        const players = [
            { id: player1Ws.id, ws: player1Ws, color: 'w' },
            { id: ws.id, ws: ws, color: 'b' }
        ];
        rooms.set(roomId, { gameId, players });
        
        player1Ws.roomId = roomId;
        ws.roomId = roomId;

        console.log(`Đã tìm thấy trận cho ${gameId}. Phòng ${roomId} được tạo cho ${player1Ws.id} và ${ws.id}.`);

        // Thông báo cho cả hai người chơi
        const player1Payload = { color: 'w', symbol: 'X' }; // Player 1 is White (Chess), X (TicTacToe)
        const player2Payload = { color: 'b', symbol: 'O' }; // Player 2 is Black (Chess), O (TicTacToe)

        player1Ws.send(JSON.stringify({ type: 'matchFound', gameId, payload: player1Payload }));
        ws.send(JSON.stringify({ type: 'matchFound', gameId, payload: player2Payload }));

    } else {
        // Không có ai đang chờ, thêm người chơi này vào hàng chờ
        waitingPlayers.set(gameId, ws);
        console.log(`Người chơi ${ws.id} đang chờ trận ${gameId}.`);
        ws.send(JSON.stringify({ type: 'waitingForMatch' }));
    }
}

function handleCreateRoom(ws, gameId) {
    const roomId = generateRoomId();
    rooms.set(roomId, {
        gameId,
        players: [{ id: ws.id, ws: ws }] // Thêm người tạo làm người chơi đầu tiên
    });
    ws.roomId = roomId;
    console.log(`Người chơi ${ws.id} đã tạo phòng ${roomId} cho game ${gameId}.`);
    ws.send(JSON.stringify({ type: 'roomCreated', roomId }));
}

function handleJoinRoom(ws, gameId, roomId) {
    const room = rooms.get(roomId);
    if (room && room.players.length === 1 && room.gameId === gameId) {
        // Phòng hợp lệ và đang chờ người chơi
        ws.roomId = roomId;
        const player1 = room.players[0];
        
        // Thêm người chơi thứ 2
        room.players.push({ id: ws.id, ws: ws });

        console.log(`Người chơi ${ws.id} đã vào phòng ${roomId}. Bắt đầu game.`);

        // Gán màu/biểu tượng ngẫu nhiên và bắt đầu game
        const isPlayer1White = Math.random() < 0.5;
        const player1Payload = { color: isPlayer1White ? 'w' : 'b', symbol: isPlayer1White ? 'X' : 'O' };
        const player2Payload = { color: isPlayer1White ? 'b' : 'w', symbol: isPlayer1White ? 'O' : 'X' };

        player1.ws.send(JSON.stringify({ type: 'startGame', gameId, payload: player1Payload }));
        ws.send(JSON.stringify({ type: 'startGame', gameId, payload: player2Payload }));

    } else {
        // Phòng không tìm thấy, đã đầy, hoặc sai loại game
        let message = 'Không tìm thấy phòng.';
        if (room && room.players.length > 1) message = 'Phòng đã đầy.';
        if (room && room.gameId !== gameId) message = 'Sai loại game cho phòng này.';
        
        ws.send(JSON.stringify({ type: 'error', message }));
    }
}

function handleMove(ws, move) {
    const roomId = ws.roomId;
    if (roomId && rooms.has(roomId)) {
        const room = rooms.get(roomId);
        const opponent = room.players.find(p => p.id !== ws.id);
        if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
            opponent.ws.send(JSON.stringify({ type: 'opponentMove', move }));
        }
    }
}

server.listen(PORT, () => {
    console.log(`AK35 Game Server đã khởi động tại http://localhost:${PORT}`);
});
