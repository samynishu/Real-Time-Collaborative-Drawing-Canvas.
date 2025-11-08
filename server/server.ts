import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { addStrokeToHistory, clearHistory, getHistory, undo, redo, deleteRoom } from './drawing-state.js';

// --- Helper Functions ---
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

function generateRoomID() {
    // Generate a 6-char uppercase alphanumeric ID
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// --- Server Setup ---
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;

// --- State Management ---
// { socketId: { color: '#...', name: 'Alice' } }
const users: Record<string, { color: string, name: string }> = {};
// { socketId: 'A4B9C' }
const socketRoomMap = new Map<string, string>();
// { 'A4B9C': 'Art Class' }
const roomDirectory = new Map<string, string>();


/**
 * Helper to get all registered users in a room
 */
function getUsersInRoom(roomID: string) {
    const usersInRoom: Record<string, { color: string, name: string }> = {};
    const socketIds = io.sockets.adapter.rooms.get(roomID);
    if (socketIds) {
        socketIds.forEach(socketId => {
            if (users[socketId]) {
                usersInRoom[socketId] = users[socketId];
            }
        });
    }
    return usersInRoom;
}

// --- Static File Serving ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
    console.log('✅ A socket connected:', socket.id);

    // --- 1. CREATE ROOM ---
    socket.on('ping-check', () => {
        socket.emit('pong-check');
    });
    socket.on('create-room', (payload: { username: string, roomName: string }) => {
        const safeName = (payload.username || 'Guest').trim().substring(0, 20);
        const safeRoomName = (payload.roomName || 'Default Room').trim().substring(0, 20);

        // Generate a unique ID
        let newRoomID = generateRoomID();
        while (roomDirectory.has(newRoomID)) {
            newRoomID = generateRoomID(); // Ensure it's unique
        }

        // 1. Store room info
        roomDirectory.set(newRoomID, safeRoomName);

        // 2. Join socket to the room
        socket.join(newRoomID);
        socketRoomMap.set(socket.id, newRoomID);

        // 3. Store user info
        users[socket.id] = { color: getRandomColor(), name: safeName };

        console.log(`🎉 Room Created: ${safeRoomName} (ID: ${newRoomID}) by ${safeName}`);

        // 4. Send "success" to the creator
        socket.emit('room-joined', {
            roomID: newRoomID,
            roomName: safeRoomName,
            history: getHistory(newRoomID),
            users: getUsersInRoom(newRoomID)
        });
    });

    // --- 2. JOIN ROOM ---
    socket.on('join-room', (payload: { username: string, roomID: string }) => {
        const safeName = (payload.username || 'Guest').trim().substring(0, 20);
        const roomID = payload.roomID.toUpperCase();

        // Check if room exists
        if (!roomDirectory.has(roomID)) {
            socket.emit('join-error', 'Room not found. Check the ID and try again.');
            return;
        }

        const roomName = roomDirectory.get(roomID)!;

        // 1. Join socket to the room
        socket.join(roomID);
        socketRoomMap.set(socket.id, roomID);

        // 2. Store user info
        users[socket.id] = { color: getRandomColor(), name: safeName };

        console.log(`👤 User Joined: ${safeName} (${socket.id}) joined room: ${roomName} (${roomID})`);

        // 3. Broadcast updated user list to the room
        io.to(roomID).emit('update-users', getUsersInRoom(roomID));

        // 4. Send "success" to the joiner
        socket.emit('room-joined', {
            roomID: roomID,
            roomName: roomName,
            history: getHistory(roomID),
            users: getUsersInRoom(roomID) // Send the full list to the new user
        });
    });


    // --- 3. In-Game Events ---
    
    function getSocketRoom(): string | undefined {
        return socketRoomMap.get(socket.id);
    }

    socket.on('draw', (data) => {
        const roomID = getSocketRoom();
        if (!roomID) return;
        socket.broadcast.to(roomID).emit('draw', data);
    });

    socket.on('end-stroke', (strokeData) => {
        const roomID = getSocketRoom();
        if (!roomID) return;
        addStrokeToHistory(roomID, strokeData);
    });

    socket.on('clear', () => {
        const roomID = getSocketRoom();
        if (!roomID) return;
        clearHistory(roomID);
        io.to(roomID).emit('history', getHistory(roomID));
    });

    socket.on('undo', () => {
        const roomID = getSocketRoom();
        if (!roomID) return;
        io.to(roomID).emit('history', undo(roomID));
    });
    
    socket.on('redo', () => {
        const roomID = getSocketRoom();
        if (!roomID) return;
        io.to(roomID).emit('history', redo(roomID));
    });

    socket.on('cursor-move', (data) => {
        const roomID = getSocketRoom();
        const user = users[socket.id];
        if (!roomID || !user) return;
        
        socket.broadcast.to(roomID).emit('cursor-move', { 
            ...data, 
            id: socket.id, 
            color: user.color 
        });
    });

    // --- 4. Disconnect ---
    socket.on('disconnect', () => {
        console.log('❌ Socket disconnected:', socket.id);
        
        const roomID = getSocketRoom();
        if (users[socket.id]) {
            delete users[socket.id];
        }
        
        if (roomID) {
            socketRoomMap.delete(socket.id);
            const usersInRoom = getUsersInRoom(roomID);

            // Broadcast updated list to the room
            io.to(roomID).emit('update-users', usersInRoom);
            io.to(roomID).emit('user-disconnect', socket.id);

            // If room is now empty, clean it up
            if (Object.keys(usersInRoom).length === 0) {
                roomDirectory.delete(roomID);
                deleteRoom(roomID);
                console.log(`🧹 Room ${roomID} is empty and was deleted.`);
            }
        }
    });
});

// --- Start Server ---
httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});