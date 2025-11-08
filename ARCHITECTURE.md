# Project Architecture

This document outlines the technical design decisions, data flow, and protocols used in the Real-Time Collaborative Canvas application.

## 1. Data Flow & State Management

This application uses a **server-authoritative** state model. The server is the single source of truth for the canvas state of every room.

**Key Concepts:**
* **`history` (Source of Truth)**: The server maintains a `strokeHistory` for each room, which is an array of "strokes".
    * A **Brush/Eraser Stroke** is an array of small `segment` objects.
    * A **Shape/Text/Image** is an array containing a *single* object with an `id`.
* **`draw` (Live Preview)**: To make brush strokes feel instant, the client broadcasts `draw` events on `mousemove`. This is for live preview only and is *not* saved to history.
* **`history` (Event)**: The server *never* sends small deltas (like "shape A moved"). Instead, after *any* change (create, move, undo, clear), it broadcasts the **entire, new history** to all clients in the room via the `history` event.
* **Client Renderer**: The client is "dumb." It simply stores this history locally and has a `redrawAll()` function that clears the canvas and redraws every object in the `history` array from bottom to top.

### Data Flow Example: Moving a Shape

1.  **Client A** (Tool: Select) -> `mousedown` on a rectangle.
2.  **Client A** -> `hitTest()` logic finds the rectangle object.
3.  **Client A** -> `mousemove` -> Updates the object's `x`/`y` in its *local* state and calls `redrawAll()` on *every frame* for a smooth local preview.
4.  **Client A** -> `mouseup` -> Emits `socket.emit('object-update', updatedObject)`.
5.  **Server** -> Receives `object-update`.
6.  **Server** -> Calls `updateObjectInHistory(roomID, updatedObject)`, which finds the object by its `id` in the `strokeHistory` and updates its properties.
7.  **Server** -> The `drawing-state` saves the new history to `db.json`.
8.  **Server** -> Emits `io.to(roomID).emit('history', newHistory)` to *all clients* in the room (including Client A).
9.  **All Clients** (A, B, C...) -> Receive the `history` event.
10. **All Clients** -> Call `Drawing.setHistory(newHistory)`, which replaces their local history.
11. **All Clients** -> Call `redrawAll()`, snapping everyone's canvas into the new, correct state.

---

## 2. WebSocket Protocol

The following messages are used for client-server communication:

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| **Room / User** | | | |
| `create-room` | C → S | `{ username, roomName }` | Request to create a new room. |
| `join-room` | C → S | `{ username, roomID }` | Request to join an existing room. |
| `room-joined` | S → C | `{ roomID, roomName, history, users }` | **Success.** Sent to the new user with all room data. |
| `join-error` | S → C | `string` (message) | Sent to the user if their Room ID is invalid. |
| `update-users` | S → C | `{ [socketId]: { name, color } }` | Broadcast to room when anyone joins or leaves. |
| `user-disconnect` | S → C | `socketId` | Broadcast to room so clients can remove cursors/timers. |
| | | | |
| **Drawing / State** | | | |
| `draw` | C → S | `Segment` (object) | (Live brush only) Sent on `mousemove` while brushing. |
| `draw` | S → C | `Segment` (object) | (Live brush only) Broadcast to others for live preview. |
| `end-stroke` | C → S | `Stroke` (array) | **Create.** Sent on `mouseup` for a new brush stroke, shape, text, or image. |
| `object-update` | C → S | `Segment` (object) | **Update.** Sent on `mouseup` after *moving* an existing object. |
| `history` | S → C | `Stroke[]` (full history) | **Sync.** The "Single Source of Truth." Broadcast to all in room on any change (create, update, undo, clear). |
| `clear` | C → S | (none) | Request to clear the canvas. |
| `undo` / `redo` | C → S | (none) | Request to undo/redo the last action. |
| | | | |
| **Presence / Meta** | | | |
| `cursor-move` | C → S | `{ x, y }` | Sent on `mousemove` (even without clicking). |
| `cursor-move` | S → C | `{ id, x, y, color }` | Broadcast to others to show live cursors and highlight user list. |
| `ping-check` | C → S | (none) | Latency check. |
| `pong-check` | S → C | (none) | Latency response. |

---

## 3. Undo/Redo Strategy

The Undo/Redo strategy is **server-authoritative** and action-based.

* The `drawing-state.ts` file maintains a `strokeHistory: Stroke[]` (the "do" stack) and a `redoStack: Stroke[]`.
* **New Action**: When `addStrokeToHistory` or `updateObjectInHistory` is called, the `redoStack` is **cleared**.
* **Undo**: When `undo` is called, the server `pop()`s the last `Stroke` from `strokeHistory` and `push()`es it onto the `redoStack`.
* **Redo**: When `redo` is called, the server `pop()`s from `redoStack` and `push()`es it back onto `strokeHistory`.
* **Sync**: After *any* of these actions, the server broadcasts the **entire modified `strokeHistory`** to all clients. This ensures all clients are perfectly in sync with the server's state.

---

## 4. Performance Decisions

* **Live Brush vs. Shapes**: Brush strokes are broadcasted live (`draw` event) segment-by-segment for a low-latency feel. Shapes, text, and images are only created on `mouseup` (`end-stroke`) to reduce network chatter.
* **Local Preview (Optimistic Update)**: When moving or creating a shape, all dragging/previewing is handled 100% locally. The network is only used on `mouseup`. This makes the UI feel instant and hides network lag.
* **`history` as Source of Truth**: We intentionally chose *not* to send small, complex "delta" updates. Broadcasting the full history on every change is less network-efficient but **infinitely more robust**. It makes it impossible for a client to become de-synced, as any missed packet is corrected on the very next update.
* **Local Persistence**: We used a simple `db.json` file for persistence. This is lightweight, human-readable, and avoids the need for an external database setup. The state is saved *asynchronously* (though `fs.writeFileSync` is blocking, a future update would use `fs.writeFile`).

---

## 5. Conflict Resolution

The application uses a **"Last-Write-Wins" (LWW)** strategy, managed by the server.

* **Move Conflict**: If Client A and Client B select and move the *same object* at the *same time*, they both send an `object-update` event on `mouseup`. The server is single-threaded and will process these events one at a time.
    1.  Server receives A's update. It updates the history and broadcasts `history-v1` to all.
    2.  Server receives B's update. It updates the history *again* and broadcasts `history-v2` to all.
    * **Result**: Both Client A and Client B will receive `history-v2`, and their canvases will snap to B's final position. The last update processed by the server "wins".
* **Eraser Conflict**: The pixel-based eraser does not interact with object-based items (shapes, text). This is a known limitation. An eraser stroke will be drawn, but it will appear *under* the objects when the canvas redraws, as objects are always drawn *after* brush strokes.