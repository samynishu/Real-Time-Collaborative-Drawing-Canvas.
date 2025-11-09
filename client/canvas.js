const Drawing = (function() {
    //1. Setup
    const canvas = document.getElementById('drawing-canvas');
    if (!canvas) {
        console.error("Fatal Error: Canvas element not found.");
        return;
    }
    const ctx = canvas.getContext('2d');
    let socket = null;
    let ready = false;

    // Drawing state
    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let snapshot = null; // For shape previews
    let currentStroke = []; // For collecting brush/eraser segments

    // Drawing properties
    const state = {
        tool: 'brush', // brush, eraser, rect, circle, text
        color: '#000000',
        width: 5
    };

    // 2. Core Drawing Event Handlers

    function startDraw(e) {
        // Prevent default to stop scrolling on touch devices
        e.preventDefault();
        
        // For mouse, only allow left-click (button 0)
        if (e.type === 'mousedown' && e.button !== 0) return;

        isDrawing = true;
        [startX, startY] = getEventPos(e);

        if (state.tool === 'brush' || state.tool === 'eraser') {
            // Freehand: Start a new path and clear the stroke buffer
            ctx.beginPath();
            currentStroke = [];
        } else if (state.tool === 'rect' || state.tool === 'circle') {
            // Shapes: Save the current canvas state to restore it during preview dragging
            snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } else if (state.tool === 'text') {
            // Text: Instant action, no dragging required
            isDrawing = false;
            handleTextTool(startX, startY);
        }
    }

    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();

        const [currentX, currentY] = getEventPos(e);

        if (state.tool === 'brush' || state.tool === 'eraser') {
            //Freehand Drawing
            const drawData = {
                type: 'segment',
                x0: startX, // The end of the last segment is the start of this one
                y0: startY,
                x1: currentX,
                y1: currentY,
                color: state.color,
                width: state.width,
                tool: state.tool
            };

            // 1. Draw locally immediately
            drawGeneric(drawData);
            // 2. Broadcast to others immediately
            if (socket) socket.emit('draw', drawData);
            // 3. Save for history
            currentStroke.push(drawData);
            
            // Update start position for the next segment
            [startX, startY] = [currentX, currentY];

        } else if (state.tool === 'rect' || state.tool === 'circle') {
            // Shape Preview
            // 1. Clear the canvas back to how it was before we started dragging
            ctx.putImageData(snapshot, 0, 0);
            // 2. Draw the shape in its current temporary state
            drawGeneric({
                type: state.tool,
                x: startX,
                y: startY,
                w: currentX - startX,
                h: currentY - startY,
                color: state.color,
                width: state.width
            });
        }
    }

    function stopDraw(e) {
        if (!isDrawing) return;
        isDrawing = false;
        
        // For shapes, we need the final end position
        // Note: 'touchend' events might not have coordinates, so we rely on the last 'touchmove'
        let [endX, endY] = [startX, startY];
        if (e.type === 'mouseup' || e.type === 'mousemove') {
             [endX, endY] = getEventPos(e);
        } else if (e.type === 'touchend' && e.changedTouches && e.changedTouches.length > 0) {
             // Try to get the last touch position if available
             const rect = canvas.getBoundingClientRect();
             endX = e.changedTouches[0].clientX - rect.left;
             endY = e.changedTouches[0].clientY - rect.top;
        }

        if (state.tool === 'brush' || state.tool === 'eraser') {
            // Finish freehand stroke
            ctx.beginPath();
            if (socket && currentStroke.length > 0) {
                socket.emit('end-stroke', currentStroke);
            }
            currentStroke = [];

        } else if (state.tool === 'rect' || state.tool === 'circle') {
            // Finalize shape
            const shapeData = {
                type: state.tool,
                x: startX,
                y: startY,
                w: endX - startX,
                h: endY - startY,
                color: state.color,
                width: state.width
            };
            
            // Ensure it's drawn definitively
            drawGeneric(shapeData);
            
            // Send as a "stroke" (array of 1 item) for history compatibility
            if (socket) socket.emit('end-stroke', [shapeData]);
        }
    }

    // --- 3. Tool-Specific Handlers ---

    function handleTextTool(x, y) {
        const text = prompt("Enter text:", "");
        if (text && text.trim() !== "") {
            const textData = {
                type: 'text',
                text: text,
                x: x,
                y: y,
                color: state.color,
                // Scale font size based on the width slider (arbitrary but useful multiplier)
                font: `${Math.max(12, state.width * 3)}px Arial` 
            };
            drawGeneric(textData);
            if (socket) socket.emit('end-stroke', [textData]);
        }
    }

    // 4. Generic Drawing Router (The Core Renderer)
    // This function knows how to draw ANY type of data our app supports.
    function drawGeneric(data) {
        ctx.save();
        ctx.beginPath();

        // Set common styles
        ctx.strokeStyle = data.color;
        ctx.fillStyle = data.color;
        ctx.lineWidth = data.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // Default composite operation (reset it just in case)
        ctx.globalCompositeOperation = 'source-over';

        switch (data.type) {
            case 'segment':
                if (data.tool === 'eraser') {
                    ctx.globalCompositeOperation = 'destination-out';
                }
                ctx.moveTo(data.x0, data.y0);
                ctx.lineTo(data.x1, data.y1);
                ctx.stroke();
                break;

            case 'rect':
                // Use strokeRect for outlines
                ctx.strokeRect(data.x, data.y, data.w, data.h);
                break;

            case 'circle':
                // Calculate radius based on the drag distance (hypotenuse)
                const radius = Math.sqrt(Math.pow(data.w, 2) + Math.pow(data.h, 2));
                ctx.arc(data.x, data.y, Math.abs(radius), 0, 2 * Math.PI);
                ctx.stroke();
                break;

            case 'text':
                ctx.font = data.font || '16px Arial';
                ctx.fillText(data.text, data.x, data.y);
                break;

            case 'image':
                // We must create a new Image object to draw it onto the canvas
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, data.x, data.y, data.w, data.h);
                };
                img.src = data.src;
                break;
        }

        ctx.restore();
    }

    //5. Helper Functions

    // Gets (x,y) relative to canvas for BOTH mouse and touch
    function getEventPos(e) {
        const rect = canvas.getBoundingClientRect();
        if (e.touches && e.touches.length > 0) {
            return [
                e.touches[0].clientX - rect.left,
                e.touches[0].clientY - rect.top
            ];
        }
        // Fallback for mouse events
        return [e.offsetX, e.offsetY];
    }

    function resizeCanvas() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        
        // Only resize if dimensions actually changed
        if (canvas.width !== width || canvas.height !== height) {
            // Save current drawing
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            tempCtx.drawImage(canvas, 0, 0);

            // Resize
            canvas.width = width;
            canvas.height = height;

            // Restore drawing
            ctx.drawImage(tempCanvas, 0, 0);
        }

        // Signal that canvas is ready for history replay
        if (!ready) {
            ready = true;
            document.dispatchEvent(new Event('drawing-ready'));
        }
    }

    //6. Public API
    return {
        init: (clientSocket) => {
            socket = clientSocket;

            // Handle window resizing
            window.addEventListener('resize', resizeCanvas);
            resizeCanvas();

            //Attach Event Listeners
            // Mouse
            canvas.addEventListener('mousedown', startDraw);
            canvas.addEventListener('mousemove', draw);
            canvas.addEventListener('mouseup', stopDraw);
            canvas.addEventListener('mouseout', stopDraw);
            // Touch (passive: false might be needed in some browsers to allow preventDefault)
            canvas.addEventListener('touchstart', startDraw, { passive: false });
            canvas.addEventListener('touchmove', draw, { passive: false });
            canvas.addEventListener('touchend', stopDraw, { passive: false });
            canvas.addEventListener('touchcancel', stopDraw, { passive: false });
        },

        // Tool setters
        setTool: (tool) => { state.tool = tool; },
        setColor: (color) => { state.color = color; },
        setWidth: (width) => { state.width = parseInt(width, 10); }, // Ensure it's a number

        clearCanvas: () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        },

        // Called by main.js when data arrives from server
        drawFromNetwork: (data) => {
            drawGeneric(data);
        },

        isReady: () => ready,

        //Image Upload Handler
        handleImageUpload: (file) => {
            if (!file.type.startsWith('image/')) {
                alert('Please upload an image file.');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // Basic scaling to prevent huge images
                    const MAX_SIZE = 500;
                    let w = img.width;
                    let h = img.height;
                    if (w > MAX_SIZE || h > MAX_SIZE) {
                        const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h);
                        w *= ratio;
                        h *= ratio;
                    }

                    const imageData = {
                        type: 'image',
                        src: img.src, // This is a base64 data URL
                        x: 50,  // Default paste position
                        y: 50,
                        w: w,
                        h: h
                    };

                    // Draw locally and send to server
                    drawGeneric(imageData);
                    if (socket) socket.emit('end-stroke', [imageData]);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    };

})();
