# Real-Time Collaborative Canvas

This is a multi-user, real-time collaborative whiteboarding application built with Node.js, Express, Socket.io, and vanilla JavaScript. It allows multiple users to join "rooms" and draw, create shapes, add text, and move objects simultaneously, with all actions synchronized across clients.

The project fulfills all core requirements of the assignment, including real-time drawing, user indicators, and global undo/redo, as well as several bonus features.

## Core Features

* **Real-Time Collaboration**: All actions are broadcast to other users in the same room in real-time.
* **Private Room System**: Users can create private rooms with a unique, shareable 6-digit ID.
* **User Presence**:
    * **Live Cursors**: See other users' cursors move on the screen, even when not drawing.
    * **Active User List**: See a list of users in the room, which highlights when a user is moving their cursor.
* **Creative Tools**:
    * **Brush** & **Eraser** (Pixel-based).
    * **Shapes** (Rectangle, Circle).
    * **Text Tool** (Click to add text).
    * **Image Upload** (Place images on the canvas).
* **Object Manipulation**:
    * **Select Tool** (Click to select shapes, text, or images).
    * **Move Tool** (Drag and drop objects to new positions).
* **State Management**:
    * **Global Undo/Redo**: A server-authoritative undo/redo stack for the entire room.
    * **Drawing Persistence**: All room drawings are saved to a `db.json` on the server. If the server restarts, all rooms and their contents are reloaded.
* **Performance**:
    * **Responsive Design**: The UI adapts to mobile and tablet screens.
    * **Touch Support**: Full drawing and tool support for mobile/tablet.
    * **Performance Overlay**: An optional overlay shows real-time FPS and network Ping (Latency).

## Tech Stack

* **Backend**: Node.js, Express, Socket.io, TypeScript
* **Frontend**: Vanilla JavaScript (ES6+), HTML5 Canvas, Socket.io-client
* **Persistence**: Local JSON file (`db.json`) acting as a simple database.

## Setup & Running

1.  **Clone the Repository**:
    ```bash
    git clone https://[your-repo-url]/collaborative-canvas.git
    cd collaborative-canvas
    ```

2.  **Install Server Dependencies**:
    ```bash
    cd server
    npm install
    ```

3.  **Run the Server**:
    ```bash
    npm run dev
    ```
    The server will start on `http://localhost:3000`.

4.  **Open the Application**:
    * Open your web browser and navigate to `http://localhost:3000`.
    * You will be presented with the "Create" or "Join" room screen.

## How to Test with Multiple Users

1.  **Open Window 1**: Open `http://localhost:3000` in a normal browser window.
2.  **Create a Room**:
    * Click "Create a Room".
    * Enter your name (e.g., "Alice") and a room name (e.g., "Test").
    * Click "Create".
3.  **Get the Room ID**:
    * You will join the canvas. In the user list box on the right, you will see the unique **Room ID** (e.g., `A4B9C`).
    * Copy this ID.
4.  **Open Window 2**: Open an Incognito window (or a different browser).
5.  **Join the Room**:
    * Navigate to `http://localhost:3000`.
    * Click "Join a Room".
    * Enter your name (e.g., "Bob") and paste the **Room ID** you copied.
    * Click "Join".
6.  **Test**: You should now see both "Alice" and "Bob" in the user list in both windows. Actions performed in one window (drawing, moving cursors, creating shapes) will appear instantly in the other.

## Known Limitations

* **No Resize/Rotate**: Objects can be selected and *moved*, but they cannot be resized or rotated.
* **Eraser vs. Objects**: The eraser is pixel-based and will not "erase" objects (shapes, text, images). It will draw *under* them, and the object will be redrawn on top during the next redraw.
* **No Layering**: There is no "bring to front" or "send to back" functionality. Objects are rendered in the order they were created.

## Time Spent on Project

*(6 Hrs)*
