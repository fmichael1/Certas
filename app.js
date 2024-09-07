let canvas;
let points = [];
const pointLabels = [
    'Proximal connector',
    'Distal connector',
    'RHS marker',
    'Setting indicator bar',
    'Setting indicator T bar'
];
const LAST_UPDATED = new Date().toLocaleString();

// You can use these longer descriptions for tooltips or more detailed instructions if needed
const pointDescriptions = [
    'Proximal connector',
    'Distal connector',
    'Right hand side marker',
    'Setting indicator bar',
    'Magnet with tantalum ball (setting indicator)'
];

let currentPointIndex = 0;
let isGrabbing = false;

function initializeApp() {
    initializeCanvas();
    addEventListeners();
    initializeControls();
    displayDebugInfo();
}

function initializeCanvas() {
    const canvasContainer = document.querySelector('.canvas-container');
    const canvasElement = document.getElementById('imageCanvas');
    
    if (!canvasContainer || !canvasElement) {
        console.error('Canvas container or canvas element not found');
        return;
    }

    const size = Math.min(canvasContainer.offsetWidth, window.innerHeight * 0.8);
    
    canvasElement.width = size;
    canvasElement.height = size;

    canvas = new fabric.Canvas('imageCanvas', {
        width: size,
        height: size,
        backgroundColor: '#f0f0f0'
    });

    canvas.on('mouse:down', handleCanvasMouseDown);
    canvas.on('mouse:move', handleCanvasMouseMove);
    canvas.on('mouse:up', handleCanvasMouseUp);
    canvas.on('mouse:wheel', handleCanvasMouseWheel);
}

function addEventListeners() {
    document.getElementById('uploadBtn').addEventListener('click', triggerFileUpload);
    document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
    document.getElementById('resetBtn').addEventListener('click', resetMarkings);
    document.getElementById('analyzeBtn').addEventListener('click', analyzeImage);
    document.getElementById('rotationSlider').addEventListener('input', handleRotationSlider);
    document.getElementById('flipHorizontalBtn').addEventListener('click', flipHorizontal);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
}

function initializeControls() {
    const rotationSlider = document.getElementById('rotationSlider');
    rotationSlider.min = -180;
    rotationSlider.max = 180;
    rotationSlider.value = 0;
}

function handleCanvasMouseDown(event) {
    if (event.e.shiftKey) {
        isGrabbing = true;
        canvas.selection = false;
        canvas.defaultCursor = 'grab';
        canvas.renderAll();
    } else {
        handleCanvasClick(event);
    }
}

function handleCanvasMouseMove(event) {
    if (isGrabbing && event.e.shiftKey) {
        canvas.defaultCursor = 'grabbing';
        const delta = new fabric.Point(event.e.movementX, event.e.movementY);
        canvas.relativePan(delta);
    } else if (isGrabbing) {
        // If shift key is released during move, stop grabbing
        isGrabbing = false;
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        canvas.renderAll();
    }
}

function handleCanvasMouseUp() {
    if (isGrabbing) {
        isGrabbing = false;
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        canvas.renderAll();
    }
}

function handleCanvasMouseWheel(event) {
    const delta = event.e.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    if (zoom > 20) zoom = 20;
    if (zoom < 0.01) zoom = 0.01;
    canvas.zoomToPoint({ x: event.e.offsetX, y: event.e.offsetY }, zoom);
    event.e.preventDefault();
    event.e.stopPropagation();
}

function handleRotationSlider(event) {
    const angle = parseInt(event.target.value);
    rotateCanvas(angle);
}

function flipHorizontal() {
    canvas.backgroundImage.set('flipX', !canvas.backgroundImage.flipX);
    canvas.renderAll();
}

function handleKeyDown(event) {
    if (event.key === 'Shift') {
        canvas.defaultCursor = 'grab';
        canvas.renderAll();
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
        removeLastPoint();
    }
}

function handleKeyUp(event) {
    if (event.key === 'Shift') {
        isGrabbing = false;
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        canvas.renderAll();
    }
}

function removeLastPoint() {
    if (points.length > 0) {
        const lastPoint = points.pop();
        canvas.remove(lastPoint.circle);
        canvas.remove(lastPoint.text);
        currentPointIndex--;
        updateInstructions(`Mark the ${pointLabels[currentPointIndex]}.`);
        canvas.renderAll();
    }
}

function triggerFileUpload() {
    document.getElementById('imageUpload').click();
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            loadImageToCanvas(e.target.result);
        };
        reader.readAsDataURL(file);
    }
}

function loadImageToCanvas(imageData) {
    fabric.Image.fromURL(imageData, function(img) {
        canvas.clear();
        fitImageToCanvas(img);
        canvas.renderAll();
        resetMarkings();
        updateInstructions('Mark the proximal end of the valve.');
        document.getElementById('resetBtn').disabled = false;
    }, { crossOrigin: 'anonymous' });
}

function fitImageToCanvas(img) {
    const scaleFactor = Math.min(canvas.width / img.width, canvas.height / img.height);
    img.scale(scaleFactor);

    const left = (canvas.width - img.width * scaleFactor) / 2;
    const top = (canvas.height - img.height * scaleFactor) / 2;

    canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
        scaleX: scaleFactor,
        scaleY: scaleFactor,
        left: left,
        top: top
    });
}

function handleCanvasClick(event) {
    if (currentPointIndex >= pointLabels.length) return;

    const pointer = canvas.getPointer(event.e);
    addPoint(pointer.x, pointer.y, pointLabels[currentPointIndex]);
    
    currentPointIndex++;
    
    if (currentPointIndex === pointLabels.length) {
        updateInstructions('All points marked. Click "Analyze" to process the image.');
        document.getElementById('analyzeBtn').disabled = false;
    } else {
        updateInstructions(`Mark the ${pointLabels[currentPointIndex]}.`);
    }
}

function addPoint(x, y, label) {
    const circle = new fabric.Circle({
        left: x,
        top: y,
        radius: 5,
        fill: 'red',
        stroke: 'white',
        strokeWidth: 2,
        selectable: false,
        evented: false
    });

    const text = new fabric.Text(label, {
        left: x + 10,
        top: y + 10,
        fontSize: 14,
        fill: 'white',
        stroke: 'black',
        strokeWidth: 0.5,
        selectable: false,
        evented: false
    });

    canvas.add(circle, text);
    points.push({ circle, text });
    canvas.renderAll();
}

function rotateCanvas(angle) {
    if (canvas.backgroundImage) {
        canvas.backgroundImage.rotate(angle);
        canvas.backgroundImage.setCoords();

        // Rotate all points
        points.forEach(point => {
            rotatePoint(point.circle, angle);
            rotatePoint(point.text, angle);
        });

        canvas.renderAll();
    }
}

function rotatePoint(obj, angle) {
    const center = canvas.getCenter();
    const radians = fabric.util.degreesToRadians(angle);
    const dx = obj.left - center.left;
    const dy = obj.top - center.top;
    const newDx = dx * Math.cos(radians) - dy * Math.sin(radians);
    const newDy = dx * Math.sin(radians) + dy * Math.cos(radians);
    obj.set({
        left: center.left + newDx,
        top: center.top + newDy
    });
    obj.setCoords();
}

function resetMarkings() {
    points.forEach(point => {
        canvas.remove(point.circle);
        canvas.remove(point.text);
    });
    points = [];
    currentPointIndex = 0;

    // Remove analysis lines
    canvas.getObjects().forEach(obj => {
        if (obj instanceof fabric.Line) {
            canvas.remove(obj);
        }
    });

    updateInstructions('Mark the proximal end of the valve.');
    document.getElementById('analyzeBtn').disabled = true;
    canvas.renderAll();
}

function updateInstructions(text) {
    const instructionsElement = document.getElementById('instructions');
    instructionsElement.textContent = text;
    
    // If you want to use the longer descriptions, you can add them here
    if (currentPointIndex < pointLabels.length) {
        const descriptionElement = document.createElement('p');
        descriptionElement.textContent = pointDescriptions[currentPointIndex];
        instructionsElement.appendChild(descriptionElement);
    }
}

function analyzeImage() {
    if (points.length < 5) {
        updateInstructions("Please mark all 5 points before analyzing.");
        return;
    }

    const proximalConnector = points[0].circle;
    const distalConnector = points[1].circle;
    const circularIndicator = points[3].circle;
    const tIndicator = points[4].circle;

    // Calculate the valve axis
    const valveAxis = {
        x: distalConnector.left - proximalConnector.left,
        y: distalConnector.top - proximalConnector.top
    };

    // Normalize the valve axis
    const axisLength = Math.sqrt(valveAxis.x * valveAxis.x + valveAxis.y * valveAxis.y);
    valveAxis.x /= axisLength;
    valveAxis.y /= axisLength;

    // Calculate the vector from circular indicator to T indicator
    const settingVector = {
        x: tIndicator.left - circularIndicator.left,
        y: tIndicator.top - circularIndicator.top
    };

    // Calculate the angle between the setting vector and the valve axis
    let angle = Math.atan2(settingVector.y, settingVector.x) - Math.atan2(valveAxis.y, valveAxis.x);
    angle = angle * (180 / Math.PI); // Convert to degrees

    // Adjust the angle so that the top vertical point of the valve axis is 0 degrees
    angle = (angle - 90 + 360) % 360;

    // Determine the valve setting based on the angle
    const setting = determineValveSetting(angle);

    // Display the result
    updateInstructions(`Analysis complete. Angle: ${angle.toFixed(2)}°, Estimated Setting: ${setting}`);
    console.log(`Angle: ${angle.toFixed(2)}°, Estimated Setting: ${setting}`);

    // Draw the valve axis and setting vector for visualization
    drawAnalysisLines(proximalConnector, distalConnector, circularIndicator, tIndicator);
}

function drawAnalysisLines(proximalConnector, distalConnector, circularIndicator, tIndicator) {
    // Draw valve axis
    const axisLine = new fabric.Line([
        proximalConnector.left, proximalConnector.top,
        distalConnector.left, distalConnector.top
    ], {
        stroke: 'blue',
        strokeWidth: 2,
        selectable: false,
        evented: false
    });

    // Draw setting vector
    const settingLine = new fabric.Line([
        circularIndicator.left, circularIndicator.top,
        tIndicator.left, tIndicator.top
    ], {
        stroke: 'green',
        strokeWidth: 2,
        selectable: false,
        evented: false
    });

    canvas.add(axisLine, settingLine);
    canvas.renderAll();
}

function determineValveSetting(angle) {
    // Normalize the angle to be between 0 and 360 degrees
    angle = (angle + 360) % 360;

    const settings = [
        { min: 350, max: 26, value: 6 },
        { min: 33, max: 70, value: 7 },
        { min: 77, max: 115, value: 8 },
        { min: 123, max: 156, value: 1 },
        { min: 171, max: 205, value: 2 },
        { min: 212, max: 249, value: 3 },
        { min: 257, max: 295, value: 4 },
        { min: 302, max: 337, value: 5 }
    ];

    for (let setting of settings) {
        if (setting.min <= setting.max) {
            if (angle >= setting.min && angle <= setting.max) {
                return setting.value;
            }
        } else {
            // This handles the case where the range crosses 0 degrees (setting 6)
            if (angle >= setting.min || angle <= setting.max) {
                return setting.value;
            }
        }
    }

    return "Unknown";
}

function displayDebugInfo() {
    const debugElement = document.createElement('div');
    debugElement.id = 'debugInfo';
    debugElement.style.position = 'fixed';
    debugElement.style.bottom = '5px';
    debugElement.style.right = '5px';
    debugElement.style.fontSize = '10px';
    debugElement.style.color = '#888';
    debugElement.textContent = `Last updated: ${LAST_UPDATED}`;
    document.body.appendChild(debugElement);
}

// Make sure this line is at the end of your file
document.addEventListener('DOMContentLoaded', initializeApp);