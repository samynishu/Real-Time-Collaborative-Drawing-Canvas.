// A "Stroke" is an array of segments
type Segment = Record<string, any>;
type Stroke = Segment[];

// This defines the drawing state for a single room
interface RoomState {
    strokeHistory: Stroke[];
    redoStack: Stroke[];
}

// --- NEW: We now store a Map of room names to their state ---
const roomStates = new Map<string, RoomState>();

/**
 * Gets the state for a room, creating it if it doesn't exist.
 */
function getRoom(roomName: string): RoomState {
    if (!roomStates.has(roomName)) {
        // Create a new default state for this room
        roomStates.set(roomName, {
            strokeHistory: [],
            redoStack: []
        });
    }
    return roomStates.get(roomName)!;
}

// All functions below now take a 'roomName' as their first argument

export const addStrokeToHistory = (roomName: string, stroke: Stroke) => {
    const room = getRoom(roomName);
    room.strokeHistory.push(stroke);
    room.redoStack = []; // A new stroke clears the redo stack
};

export const clearHistory = (roomName: string) => {
    const room = getRoom(roomName);
    room.strokeHistory = [];
    room.redoStack = [];
};

export const getHistory = (roomName: string) => {
    return getRoom(roomName).strokeHistory;
};

export const undo = (roomName: string) => {
    const room = getRoom(roomName);
    if (room.strokeHistory.length > 0) {
        const undoneStroke = room.strokeHistory.pop();
        if (undoneStroke) {
            room.redoStack.push(undoneStroke);
        }
    }
    return room.strokeHistory;
};

export const redo = (roomName: string) => {
    const room = getRoom(roomName);
    if (room.redoStack.length > 0) {
        const redoneStroke = room.redoStack.pop();
        if (redoneStroke) {
            room.strokeHistory.push(redoneStroke);
        }
    }
    return room.strokeHistory;
};

/**
 * --- NEW: Clean up a room's state when it's empty ---
 * (We'll call this later)
 */
export const deleteRoom = (roomName: string) => {
    if (roomStates.has(roomName)) {
        roomStates.delete(roomName);
    }
};