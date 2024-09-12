let canvas;
let points = [];
const pointLabels = [
    'Proximal connector',
    'Distal connector',
    'RHS marker',
    'Setting indicator bar',
    'Setting indicator T bar'
];
const LAST_UPDATED = "2023-12-09 00:33:00";

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

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    initializeCanvas();
    addEventListeners();
    initializeControls();
    initializePdfLinks();
    displayDebugInfo();
}

function addEventListeners() {
    const uploadBtn = document.getElementById('uploadBtn');
    const imageUpload = document.getElementById('imageUpload');
    const resetBtn = document.getElementById('resetBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const rotationSlider = document.getElementById('rotationSlider');
    const flipHorizontalBtn = document.getElementById('flipHorizontalBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const uploadArea = document.getElementById('uploadArea');

    if (uploadBtn) uploadBtn.addEventListener('click', triggerFileUpload);
    if (imageUpload) imageUpload.addEventListener('change', handleImageUpload);
    if (resetBtn) resetBtn.addEventListener('click', resetMarkings);
    if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeImage);
    if (rotationSlider) rotationSlider.addEventListener('input', handleRotationSlider);
    if (flipHorizontalBtn) flipHorizontalBtn.addEventListener('click', flipHorizontal);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadAnalysis);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    initializePdfLinks();

    // Initialize upload area
    if (uploadArea) {
        initializeUploadArea(uploadArea, imageUpload);
    } else {
        console.error('Upload area not found');
    }
}

let isFileInputClicked = false;

function initializeUploadArea(uploadArea, imageUpload) {
    // Click to open file selection
    uploadArea.addEventListener('click', (e) => {
        console.log('Upload area clicked');
        e.preventDefault();
        e.stopPropagation();
        if (!isFileInputClicked) {
            triggerFileUpload();
        }
    });

    // Prevent click on the file input from bubbling up to the upload area
    imageUpload.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    imageUpload.addEventListener('change', (e) => {
        console.log('File selected');
        isFileInputClicked = false;
        if (e.target.files.length) {
            handleImageUpload(e.target.files[0]);
        }
    });

    // Reset flag when file dialog is closed
    window.addEventListener('focus', () => {
        setTimeout(() => {
            isFileInputClicked = false;
        }, 300);
    });

    // Prevent default behavior for drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Handle drag enter and leave visual feedback
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        uploadArea.classList.add('dragover');
    }

    function unhighlight() {
        uploadArea.classList.remove('dragover');
    }

    // Handle dropped files
    uploadArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            handleImageUpload(files[0]);
        }
    }

    // Add event listener for Ctrl+V or Command+V
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
            e.preventDefault();
            navigator.clipboard.read().then(clipboardItems => {
                for (const clipboardItem of clipboardItems) {
                    for (const type of clipboardItem.types) {
                        if (type.startsWith('image/')) {
                            clipboardItem.getType(type).then(blob => {
                                handleImageUpload(blob);
                            });
                        }
                    }
                }
            });
        }
    });

    console.log('Upload area initialized');
}

function triggerFileUpload() {
    const imageUpload = document.getElementById('imageUpload');
    if (imageUpload) {
        console.log('Triggering file upload');
        isFileInputClicked = true;
        imageUpload.click();
    } else {
        console.error('Image upload input not found');
    }
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

function initializeControls() {
    const rotationSlider = document.getElementById('rotationSlider');
    rotationSlider.min = -180;
    rotationSlider.max = 180;
    rotationSlider.value = 0;
}

function initializePdfLinks() {
    const pdfLinks = document.querySelectorAll('.dropdown-item[data-pdf]');
    pdfLinks.forEach(link => {
        link.addEventListener('click', openPdfGuide);
    });
}

function openPdfGuide(event) {
    event.preventDefault();
    const pdfFile = event.target.getAttribute('data-pdf');
    const pdfUrl = `pdf/${pdfFile}`; // Update this path to where your PDFs are stored
    window.open(pdfUrl, '_blank');
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
        if (lastPoint.arrowhead) {
            canvas.remove(lastPoint.arrowhead);
        }
        currentPointIndex--;
        updateInstructions(`Mark the ${pointLabels[currentPointIndex]}.`);
        canvas.renderAll();
    }
}

function handleImageUpload(file) {
    console.log('File selected:', file);
    // Your existing image upload logic here
    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
            loadImageToCanvas(event.target.result);
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(file);
}

function loadImageToCanvas(imageData) {
    fabric.Image.fromURL(imageData, function (img) {
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
            if (point.arrowhead) {
                rotatePoint(point.arrowhead, angle);
            }
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
    if (obj instanceof fabric.Triangle) {
        obj.rotate(angle);
    }
    obj.setCoords();
}

function resetMarkings() {
    console.log('Resetting markings...');
    console.log('Points before reset:', points.length);
    console.log('Canvas objects before reset:', canvas.getObjects().length);

    points.forEach(point => {
        canvas.remove(point.circle);
        canvas.remove(point.text);
        if (point.arrowhead) {
            console.log('Removing point arrowhead');
            canvas.remove(point.arrowhead);
        }
    });
    points = [];
    currentPointIndex = 0;

    // Remove analysis lines and arrowhead
    canvas.getObjects().forEach(obj => {
        if (obj instanceof fabric.Line || obj.isArrowhead) {
            console.log('Removing object:', obj.type, obj.isArrowhead);
            canvas.remove(obj);
        }
    });

    console.log('Canvas objects after reset:', canvas.getObjects().length);

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

    // Enable or disable the download button based on whether analysis has been performed
    document.getElementById('downloadBtn').disabled = !text.includes('Analysis complete') && !text.includes('Image inconclusive');
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
    let angle = Math.atan2(settingVector.y, settingVector.x) - Math.atan2(-valveAxis.y, -valveAxis.x);
    angle = angle * (180 / Math.PI); // Convert to degrees

    angle = (angle + 360) % 360;

    // Determine the valve setting based on the angle
    const setting = determineValveSetting(angle);

    // Display the result
    let resultMessage;
    if (setting === "Unknown") {
        const nearestSettings = findNearestSettings(angle);
        resultMessage = `Image inconclusive - estimated setting is between ${nearestSettings[0]} and ${nearestSettings[1]}. Please repeat the X-ray.`;
    } else {
        resultMessage = `Analysis complete. Angle: ${angle.toFixed(2)}°, Estimated Setting: ${setting}`;
    }

    updateInstructions(resultMessage);
    console.log(resultMessage);

    // Draw the valve axis and setting vector for visualization
    drawAnalysisLines(proximalConnector, distalConnector, circularIndicator, tIndicator);

    // Enable the download button after analysis
    document.getElementById('downloadBtn').disabled = false;
}

function findNearestSettings(angle) {
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

    let lowerSetting = 0;
    let upperSetting = 0;

    for (let i = 0; i < settings.length; i++) {
        const currentSetting = settings[i];
        const nextSetting = settings[(i + 1) % settings.length];

        if (currentSetting.min <= currentSetting.max) {
            if (angle > currentSetting.max && angle < nextSetting.min) {
                lowerSetting = currentSetting.value;
                upperSetting = nextSetting.value;
                break;
            }
        } else {
            // Handle the case where the range crosses 0 degrees (setting 6)
            if ((angle > currentSetting.min && angle <= 360) || (angle >= 0 && angle < nextSetting.min)) {
                lowerSetting = currentSetting.value;
                upperSetting = nextSetting.value;
                break;
            }
        }
    }

    return [lowerSetting, upperSetting];
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

    // Calculate arrowhead points
    const angle = Math.atan2(tIndicator.top - circularIndicator.top, tIndicator.left - circularIndicator.left);
    const arrowLength = 10; // Reduced from 15 to make it smaller
    const arrowAngle = Math.PI / 6; // 30 degrees

    // Create arrowhead
    const arrowhead = new fabric.Triangle({
        left: tIndicator.left,
        top: tIndicator.top,
        pointType: 'arrow_start',
        angle: (angle * 180 / Math.PI) + 90,
        width: arrowLength * 2,
        height: arrowLength * 2,
        fill: 'green',
        selectable: false,
        evented: false,
        originX: 'center',
        originY: 'center',
        isArrowhead: true  // Add this custom property
    });

    // Add all elements to canvas
    canvas.add(axisLine, settingLine, arrowhead);
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

    const lastUpdated = new Date(LAST_UPDATED);
    debugElement.textContent = `Last updated: ${lastUpdated.toLocaleString()}`;

    document.body.appendChild(debugElement);
}

function downloadAnalysis() {
    // Create a new canvas that includes the entire app view
    const appView = document.querySelector('.container-fluid');
    html2canvas(appView).then(canvas => {
        // Add the result message to the canvas
        const ctx = canvas.getContext('2d');
        ctx.font = '14px Arial';
        ctx.fillStyle = 'black';
        ctx.fillText(document.getElementById('instructions').textContent, 10, canvas.height - 20);

        // Convert the canvas to a data URL
        const dataURL = canvas.toDataURL('image/png');

        // Create a temporary link element and trigger the download
        const downloadLink = document.createElement('a');
        downloadLink.href = dataURL;
        downloadLink.download = 'certas_vps_valve_analysis.png';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    });
}