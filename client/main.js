// --- 1. WebSocket Connection ---
const socket = io();
let currentRoomID = '';
let currentRoomName = '';

socket.on('connect', () => console.log('✅ Connected to WebSocket server.'));
socket.on('disconnect', () => {
    console.log('❌ Disconnected from WebSocket server.');
    alert("You have been disconnected. Please refresh to rejoin.");
});


// Performence Metrics Module
const Performance = (function() {
    const statsEl = document.getElementById('performance-stats');
    let fps = 0, latency = 0, frameCount = 0, lastFpsUpdate = performance.now();
    
    function fpsLoop(now) {
        frameCount++;
        if (now - lastFpsUpdate >= 1000) {
            fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
            frameCount = 0;
            lastFpsUpdate = now;
            updateDisplay();
        }
        requestAnimationFrame(fpsLoop);
    }
    
    function startLatencyLoop(socket) {
        setInterval(() => {
            const start = performance.now();
            socket.emit('ping-check');
            socket.once('pong-check', () => {
                latency = Math.round(performance.now() - start);
                updateDisplay();
            });
        }, 2000);
    }
    
    function updateDisplay() {
        if (!statsEl) return;
        statsEl.textContent = `FPS: ${fps.toString().padEnd(3)} | Ping: ${latency}ms`;
        statsEl.className = ''; // Clear classes
        if (latency < 100) statsEl.classList.add('ping-good');
        else if (latency < 300) statsEl.classList.add('ping-ok');
        else statsEl.classList.add('ping-bad');
    }
    
    return {
        init: (socket) => {
            requestAnimationFrame(fpsLoop);
            startLatencyLoop(socket);
        }
    };
})();


// Server Listeners 
socket.on('room-joined', (data) => {
    const { roomID, roomName, history, users } = data;
    console.log(`🎉 Joined room! ${roomName} (${roomID})`);
    
    currentRoomID = roomID;
    currentRoomName = roomName;
    
    document.getElementById('join-screen').style.display = 'none';
    document.getElementById('join-message').textContent = '';
    
    const roomInfoBox = document.getElementById('room-info');
    roomInfoBox.innerHTML = `
        <h3>${escapeHtml(roomName)}</h3>
        <p>Room ID: <code>${roomID}</code></p>
    `;
    
    Drawing.clearCanvas();
    const redraw = () => {
        history.forEach(stroke => {
            stroke.forEach(segment => Drawing.drawFromNetwork(segment));
        });
    };
    if (Drawing.isReady()) redraw();
    else document.addEventListener('drawing-ready', redraw, { once: true });
    
    updateUserList(users);
});

socket.on('join-error', (message) => {
    document.getElementById('join-message').textContent = message;
    document.getElementById('create-room-btn').disabled = false;
    document.getElementById('join-room-btn').disabled = false;
});

// Handles segments, shapes, text, images
socket.on('draw', (data) => {
    Drawing.drawFromNetwork(data);
});

// Handles history sync for undo, redo, clear
socket.on('history', (history) => {
    console.log(`Syncing history: ${history.length} items`);
    Drawing.clearCanvas();
    history.forEach(stroke => {
        stroke.forEach(segment => {
            Drawing.drawFromNetwork(segment);
        });
    });
});

//Cursor Logic
const userCursors = {};
socket.on('cursor-move', (data) => {
    const { id, x, y, color } = data;
    const cursorContainer = document.getElementById('cursor-container');
    if (!cursorContainer) return;

    if (!userCursors[id]) {
        const cursorEl = document.createElement('div');
        cursorEl.className = 'user-cursor';
        cursorContainer.appendChild(cursorEl);
        userCursors[id] = cursorEl;
    }
    const cursorEl = userCursors[id];
    cursorEl.style.left = `${x}px`;
    cursorEl.style.top = `${y}px`;
    cursorEl.style.borderColor = color;
});
socket.on('user-disconnect', (id) => {
    if (userCursors[id]) {
        userCursors[id].remove();
        delete userCursors[id];
    }
});

//User List Logic
socket.on('update-users', (users) => {
    updateUserList(users);
});

function updateUserList(users) {
    const userListUI = document.getElementById('users');
    if (!userListUI) return;
    userListUI.innerHTML = '';

    for (const id in users) {
        const user = users[id];
        const li = document.createElement('li');
        li.title = `Socket ID: ${id}`;
        li.innerHTML = `
            <span style="color: ${user.color}; font-weight: 900;">■</span>
            ${escapeHtml(user.name)}
        `;
        if (id === socket.id) {
            li.innerHTML += ' <strong>(You)</strong>';
        }
        userListUI.appendChild(li);
    }
}

function escapeHtml(unsafe) {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}


//2. App Initialization
document.addEventListener('DOMContentLoaded', () => {
    
    // Initialize Modules
    Drawing.init(socket);
    Performance.init(socket);

    //Join Screen View Management
    const joinScreen = document.getElementById('join-screen');
    const menuView = document.getElementById('join-menu-view');
    const createView = document.getElementById('create-room-view');
    const joinView = document.getElementById('join-room-view');
    const joinMessage = document.getElementById('join-message');

    document.getElementById('show-create-btn').addEventListener('click', () => {
        menuView.style.display = 'none';
        createView.style.display = 'block';
        joinMessage.textContent = '';
    });
    document.getElementById('show-join-btn').addEventListener('click', () => {
        menuView.style.display = 'none';
        joinView.style.display = 'block';
        joinMessage.textContent = '';
    });
    document.getElementById('create-back-btn').addEventListener('click', () => {
        createView.style.display = 'none';
        menuView.style.display = 'block';
    });
    document.getElementById('join-back-btn').addEventListener('click', () => {
        joinView.style.display = 'none';
        menuView.style.display = 'block';
    });

    // Join Screen Actions
    const createUsernameInput = document.getElementById('create-username-input');
    const createRoomNameInput = document.getElementById('create-room-name-input');
    const createRoomBtn = document.getElementById('create-room-btn');
    
    const joinUsernameInput = document.getElementById('join-username-input');
    const joinRoomIDInput = document.getElementById('join-room-id-input');
    const joinRoomBtn = document.getElementById('join-room-btn');

    createRoomBtn.addEventListener('click', function() {
        const username = createUsernameInput.value;
        const roomName = createRoomNameInput.value;
        if (!username || !roomName) {
            joinMessage.textContent = 'Please fill out both fields.';
            return;
        }
        this.disabled = true;
        joinMessage.textContent = 'Creating room...';
        socket.emit('create-room', { username, roomName });
    });

    joinRoomBtn.addEventListener('click', function() {
        const username = joinUsernameInput.value;
        const roomID = joinRoomIDInput.value;
        if (!username || !roomID) {
            joinMessage.textContent = 'Please fill out both fields.';
            return;
        }
        this.disabled = true;
        joinMessage.textContent = 'Joining room...';
        socket.emit('join-room', { username, roomID });
    });

    //Toolbar & Tool Listeners
    
    // Group tool buttons for easy active-state management
    const toolButtons = [
        { id: 'tool-brush', tool: 'brush' },
        { id: 'tool-eraser', tool: 'eraser' },
        { id: 'tool-rect', tool: 'rect' },
        { id: 'tool-circle', tool: 'circle' },
        { id: 'tool-text', tool: 'text' }
    ];

    toolButtons.forEach(btn => {
        document.getElementById(btn.id).addEventListener('click', function() {
            Drawing.setTool(btn.tool);
            // Clear active state from all tool buttons
            document.querySelectorAll('.tool').forEach(el => el.classList.remove('active'));
            // Add active state to this one
            this.classList.add('active');
        });
    });

    // Image upload is special
    document.getElementById('tool-image-upload').addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            Drawing.handleImageUpload(e.target.files[0]);
            // Reset the input so you can upload the same file again
            e.target.value = null; 
        }
    });
    
    // Other toolbar items
    document.getElementById('stroke-width').addEventListener('input', (e) => {
        Drawing.setWidth(e.target.value);
        document.getElementById('stroke-width-label').textContent = e.target.value;
    });
    
    document.getElementById('stroke-color').addEventListener('input', (e) => {
        Drawing.setColor(e.target.value);
    });
    
    document.getElementById('action-clear').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the canvas for everyone?')) {
            socket.emit('clear');
        }
    });
    
    document.getElementById('action-undo').addEventListener('click', () => socket.emit('undo'));
    document.getElementById('action-redo').addEventListener('click', () => socket.emit('redo'));

    //Cursor Sending Logic
    const canvas = document.getElementById('drawing-canvas');
 // --- Cursor Sending Logic ---
    if (canvas) {
        // Helper to check if we are actually in a room
        const isJoined = () => currentRoomID !== '';

        // Mouse move (fires all the time when hovering)
        canvas.addEventListener('mousemove', (e) => {
            if (isJoined()) {
                socket.emit('cursor-move', { x: e.offsetX, y: e.offsetY });
            }
        });

        // Hide cursor when mouse leaves the canvas area
        canvas.addEventListener('mouseout', () => {
            if (isJoined()) {
                socket.emit('cursor-move', { x: -100, y: -100 });
            }
        });

        // Touch move (for mobile "hover" while dragging finger)
        canvas.addEventListener('touchmove', (e) => {
            if (isJoined() && e.touches.length > 0) {
                const rect = canvas.getBoundingClientRect();
                const x = e.touches[0].clientX - rect.left;
                const y = e.touches[0].clientY - rect.top;
                socket.emit('cursor-move', { x: x, y: y });
            }
        });

        // Hide cursor when touch ends
        canvas.addEventListener('touchend', () => {
            if (isJoined()) socket.emit('cursor-move', { x: -100, y: -100 });
        });
        canvas.addEventListener('touchcancel', () => {
            if (isJoined()) socket.emit('cursor-move', { x: -100, y: -100 });
        });
    }

}); // End of DOMContentLoaded
