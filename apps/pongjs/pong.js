// P2P Pong Game - derlocke-ng
let pc = null;
let dataChannel = null;
let isHost = false;
let gameStarted = false;
let myName = 'PLAYER';
let opponentName = 'PLAYER';

// Game state
const canvas = document.getElementById('pong');
const ctx = canvas.getContext('2d');
const paddleWidth = 12, paddleHeight = 80;
const ballSize = 12;
const paddleOffset = 15;
let paddleSpeed = 8;

let leftY, rightY, leftScore, rightScore, ballX, ballY, ballVX, ballVY;
let hitCount = 0;
let ballPaused = false;
let pauseTimer = 0;

// Delta time for smooth physics
let lastTime = 0;
const TARGET_FPS = 60;
const FIXED_DT = 1000 / TARGET_FPS;

// Ball physics (pixels per fixed frame)
const BALL_START_SPEED = 3;
const BALL_MAX_SPEED = 10;
const BALL_SPEED_Y_MAX = 5;
const SPEED_INCREMENT = 0.3;

function initGameState() {
    canvas.width = Math.min(600, window.innerWidth - 40);
    canvas.height = 400;
    leftY = canvas.height / 2 - paddleHeight / 2;
    rightY = canvas.height / 2 - paddleHeight / 2;
    leftScore = 0;
    rightScore = 0;
    hitCount = 0;
    resetBall(true);
}

// UI Elements
const menu = document.getElementById('menu');
const hostPanel = document.getElementById('hostPanel');
const joinPanel = document.getElementById('joinPanel');
const gameContainer = document.getElementById('gameContainer');
const gameStatus = document.getElementById('gameStatus');
const leftNameEl = document.getElementById('leftName');
const rightNameEl = document.getElementById('rightName');
// PeerJS UI
const peerjsPanel = document.getElementById('peerjsPanel');
const peerjsHost = document.getElementById('peerjsHost');
const peerjsJoin = document.getElementById('peerjsJoin');
const peerjsRoomCode = document.getElementById('peerjsRoomCode');
const copyPeerjsRoom = document.getElementById('copyPeerjsRoom');
const peerjsHostStatus = document.getElementById('peerjsHostStatus');
const peerjsJoinCode = document.getElementById('peerjsJoinCode');
const peerjsJoinBtn = document.getElementById('peerjsJoinBtn');
const peerjsJoinStatus = document.getElementById('peerjsJoinStatus');
const connectionMode = document.getElementById('connectionMode');

let peer = null;
let peerConn = null;
let usingPeerJS = false;

// Show/hide panels based on connection mode
function showPanel(panel) {
    hostPanel.style.display = 'none';
    joinPanel.style.display = 'none';
    peerjsPanel.style.display = 'none';
    if (panel) panel.style.display = 'block';
}

// Listen for connection mode changes
connectionMode.addEventListener('change', () => {
    showPanel(null);
});
// ICE config for NAT traversal
const ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Compress/decompress for shorter codes
function compress(obj) {
    return btoa(JSON.stringify(obj));
}
function decompress(str) {
    try {
        return JSON.parse(atob(str.trim()));
    } catch(e) {
        return null;
    }
}

// Get username
function getUsername() {
    const input = document.getElementById('username').value.trim().toUpperCase();
    return input || 'PLAYER';
}

// HOST: Create game
document.getElementById('hostBtn').onclick = async () => {
    myName = getUsername();
    isHost = true;
    menu.style.display = 'none';
    if (connectionMode.value === 'peerjs') {
        usingPeerJS = true;
        showPanel(peerjsPanel);
        peerjsHost.style.display = 'block';
        peerjsJoin.style.display = 'none';
        // Start PeerJS host logic
        startPeerjsHost();
    } else {
        usingPeerJS = false;
        showPanel(hostPanel);
        document.getElementById('hostStatus').textContent = 'GENERATING CODE...';
        // ...existing manual WebRTC host logic...
        pc = new RTCPeerConnection(ICE_CONFIG);
        dataChannel = pc.createDataChannel('pong');
        setupDataChannel(dataChannel);
        pc.onicecandidate = (e) => {
            if (pc.iceGatheringState === 'complete') {
                const code = compress(pc.localDescription);
                document.getElementById('hostCode').value = code;
                document.getElementById('hostStatus').textContent = 'SEND CODE TO FRIEND';
            }
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
    }
};

// PeerJS host logic
function startPeerjsHost() {
    peer = new Peer(undefined, { debug: 2 });
    peer.on('open', (id) => {
        // Use full peer id so joiners can connect reliably
        peerjsRoomCode.value = id;
        peerjsHostStatus.textContent = 'WAITING FOR PLAYER...';
    });
    peer.on('connection', (conn) => {
        peerConn = conn;
        setupPeerjsDataChannel(conn);
        peerjsHostStatus.textContent = 'CONNECTED!';
        // Hide panel and start game
        setTimeout(() => { showPanel(null); startGame(); }, 500);
    });

    // Copy room code button (add listener only once)
    if (!copyPeerjsRoom._bound) {
        copyPeerjsRoom.addEventListener('click', () => {
            const code = peerjsRoomCode.value || '';
            if (!code) return;
            navigator.clipboard.writeText(code).then(() => {
                peerjsHostStatus.textContent = '*** COPIED ***';
                setTimeout(() => { peerjsHostStatus.textContent = 'WAITING FOR PLAYER...'; }, 1200);
            }).catch(() => {
                peerjsHostStatus.textContent = 'COPY FAILED';
            });
        });
        copyPeerjsRoom._bound = true;
    }
    peer.on('error', (err) => {
        peerjsHostStatus.textContent = 'ERROR: ' + err;
    });
}
// HOST: Connect with answer
document.getElementById('hostConnect').onclick = async () => {
    const answer = decompress(document.getElementById('hostAnswer').value);
    if (!answer) {
        document.getElementById('hostStatus').textContent = 'INVALID CODE!';
        return;
    }
    try {
        await pc.setRemoteDescription(answer);
        document.getElementById('hostStatus').textContent = 'CONNECTING...';
    } catch(e) {
        document.getElementById('hostStatus').textContent = 'CONNECTION FAILED';
    }
};

// JOIN: Show panel
document.getElementById('joinBtn').onclick = () => {
    myName = getUsername();
    isHost = false;
    menu.style.display = 'none';
    if (connectionMode.value === 'peerjs') {
        usingPeerJS = true;
        showPanel(peerjsPanel);
        peerjsHost.style.display = 'none';
        peerjsJoin.style.display = 'block';
    } else {
        usingPeerJS = false;
        showPanel(joinPanel);
    }
};

// PeerJS join logic
peerjsJoinBtn.addEventListener('click', () => {
    const code = peerjsJoinCode.value.trim();
    if (!code) return;
    peerjsJoinStatus.textContent = 'CONNECTING...';
    peer = new Peer(undefined, { debug: 2 });
    peer.on('open', () => {
        peerConn = peer.connect(code);
        peerConn.on('open', () => {
            setupPeerjsDataChannel(peerConn);
            peerjsJoinStatus.textContent = 'CONNECTED!';
            setTimeout(() => { showPanel(null); startGame(); }, 500);
        });
        peerConn.on('error', (err) => {
            peerjsJoinStatus.textContent = 'ERROR: ' + err;
        });
    });
    peer.on('error', (err) => {
        peerjsJoinStatus.textContent = 'ERROR: ' + err;
    });
});

// PeerJS data channel setup (create a small shim that looks like an RTCDataChannel)
function setupPeerjsDataChannel(conn) {
    const shim = {
        _onopen: null,
        _onclose: null,
        _onmessage: null,
        send: (s) => conn.send(typeof s === 'string' ? s : JSON.stringify(s)),
        get readyState() { return conn.open ? 'open' : 'closed'; },
        set onopen(fn) { this._onopen = fn; },
        set onclose(fn) { this._onclose = fn; },
        set onmessage(fn) { this._onmessage = fn; }
    };

    conn.on('open', () => { if (shim._onopen) shim._onopen(); });
    conn.on('close', () => { if (shim._onclose) shim._onclose(); gameStatus.textContent = '*** DISCONNECTED ***'; gameStarted = false; });
    conn.on('data', (data) => {
        if (shim._onmessage) shim._onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    });

    dataChannel = shim;
    setupDataChannel(shim);
}
// JOIN: Process host code
document.getElementById('joinConnect').onclick = async () => {
    const offer = decompress(document.getElementById('joinCode').value);
    if (!offer) {
        document.getElementById('joinStatus').textContent = 'INVALID CODE!';
        return;
    }

    document.getElementById('joinStatus').textContent = 'GENERATING RESPONSE...';

    pc = new RTCPeerConnection(ICE_CONFIG);
    
    pc.ondatachannel = (e) => {
        dataChannel = e.channel;
        setupDataChannel(dataChannel);
    };

    pc.onicecandidate = (e) => {
        if (pc.iceGatheringState === 'complete') {
            const code = compress(pc.localDescription);
            document.getElementById('joinAnswer').value = code;
            document.getElementById('joinStatus').textContent = 'SEND RESPONSE TO HOST';
        }
    };

    try {
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
    } catch(e) {
        document.getElementById('joinStatus').textContent = 'ERROR: ' + e.message;
    }
};

// Copy buttons
document.getElementById('copyHostCode').onclick = () => {
    const code = document.getElementById('hostCode');
    code.select();
    navigator.clipboard.writeText(code.value);
    document.getElementById('hostStatus').textContent = '*** COPIED ***';
};
document.getElementById('copyJoinAnswer').onclick = () => {
    const code = document.getElementById('joinAnswer');
    code.select();
    navigator.clipboard.writeText(code.value);
    document.getElementById('joinStatus').textContent = '*** COPIED ***';
};

// Setup data channel
function setupDataChannel(channel) {
    channel.onopen = () => {
        channel.send(JSON.stringify({ type: 'name', name: myName }));
    };
    
    channel.onclose = () => {
        gameStatus.textContent = '*** DISCONNECTED ***';
        gameStarted = false;
    };
    
    channel.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        
        if (msg.type === 'name') {
            opponentName = msg.name || 'PLAYER';
            if (isHost) {
                startGame();
                send({ type: 'start', hostName: myName });
            }
        }
        if (msg.type === 'start') {
            opponentName = msg.hostName || 'PLAYER';
            startGame();
        }
        if (msg.type === 'state' && !isHost) {
            leftY = msg.leftY;
            rightY = msg.rightY;
            leftScore = msg.leftScore;
            rightScore = msg.rightScore;
            ballX = msg.ballX;
            ballY = msg.ballY;
        }
        if (msg.type === 'paddle' && isHost) {
            rightY = msg.y;
        }
    };
}

function send(obj) {
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(obj));
    }
}

function startGame() {
    hostPanel.style.display = 'none';
    joinPanel.style.display = 'none';
    gameContainer.style.display = 'block';
    gameStarted = true;
    initGameState();
    
    if (isHost) {
        leftNameEl.textContent = 'P1: ' + myName;
        rightNameEl.textContent = 'P2: ' + opponentName;
        gameStatus.textContent = '< YOU ARE LEFT PADDLE >';
    } else {
        leftNameEl.textContent = 'P1: ' + opponentName;
        rightNameEl.textContent = 'P2: ' + myName;
        gameStatus.textContent = '< YOU ARE RIGHT PADDLE >';
    }
}

// Game rendering
function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#33ff33';
    const dashHeight = 15, dashGap = 10;
    for (let y = 0; y < canvas.height; y += dashHeight + dashGap) {
        ctx.fillRect(canvas.width / 2 - 2, y, 4, dashHeight);
    }

    ctx.shadowColor = '#33ff33';
    ctx.shadowBlur = 10;
    ctx.fillRect(paddleOffset, leftY, paddleWidth, paddleHeight);
    ctx.fillRect(canvas.width - paddleOffset - paddleWidth, rightY, paddleWidth, paddleHeight);
    ctx.fillRect(ballX, ballY, ballSize, ballSize);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 60px Courier New, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(leftScore, canvas.width / 4, 70);
    ctx.fillText(rightScore, 3 * canvas.width / 4, 70);
}

// Game logic (host only)
function update() {
    if (!gameStarted || !isHost) return;

    if (ballPaused) {
        pauseTimer--;
        if (pauseTimer <= 0) ballPaused = false;
        send({ type: 'state', leftY, rightY, leftScore, rightScore, ballX, ballY });
        return;
    }

    ballX += ballVX;
    ballY += ballVY;

    if (ballY <= 0) { ballY = 0; ballVY = -ballVY; }
    if (ballY + ballSize >= canvas.height) { ballY = canvas.height - ballSize; ballVY = -ballVY; }

    const leftPaddleRight = paddleOffset + paddleWidth;
    if (ballX <= leftPaddleRight && ballX + ballSize >= paddleOffset &&
        ballY + ballSize >= leftY && ballY <= leftY + paddleHeight && ballVX < 0) {
        ballX = leftPaddleRight;
        hitCount++;
        const newSpeed = Math.min(Math.abs(ballVX) + SPEED_INCREMENT, BALL_MAX_SPEED);
        ballVX = newSpeed;
        const hitPoint = ((ballY + ballSize/2) - (leftY + paddleHeight/2)) / (paddleHeight/2);
        ballVY += hitPoint * 1.5;
        ballVY = Math.max(-BALL_SPEED_Y_MAX, Math.min(BALL_SPEED_Y_MAX, ballVY));
    }

    const rightPaddleLeft = canvas.width - paddleOffset - paddleWidth;
    if (ballX + ballSize >= rightPaddleLeft && ballX <= canvas.width - paddleOffset &&
        ballY + ballSize >= rightY && ballY <= rightY + paddleHeight && ballVX > 0) {
        ballX = rightPaddleLeft - ballSize;
        hitCount++;
        const newSpeed = Math.min(Math.abs(ballVX) + SPEED_INCREMENT, BALL_MAX_SPEED);
        ballVX = -newSpeed;
        const hitPoint = ((ballY + ballSize/2) - (rightY + paddleHeight/2)) / (paddleHeight/2);
        ballVY += hitPoint * 1.5;
        ballVY = Math.max(-BALL_SPEED_Y_MAX, Math.min(BALL_SPEED_Y_MAX, ballVY));
    }

    if (ballX + ballSize < 0) { rightScore++; resetBall(false); }
    if (ballX > canvas.width) { leftScore++; resetBall(true); }

    send({ type: 'state', leftY, rightY, leftScore, rightScore, ballX, ballY });
}

function resetBall(goLeft) {
    ballX = canvas.width / 2 - ballSize / 2;
    ballY = canvas.height / 2 - ballSize / 2;
    hitCount = 0;
    ballVX = BALL_START_SPEED * (goLeft ? -1 : 1);
    ballVY = (Math.random() - 0.5) * 1.5;
    ballPaused = true;
    pauseTimer = 60;
}

function moveUp() {
    if (!gameStarted) return;
    if (isHost) {
        leftY = Math.max(0, leftY - paddleSpeed);
    } else {
        rightY = Math.max(0, rightY - paddleSpeed);
        send({ type: 'paddle', y: rightY });
    }
}

function moveDown() {
    if (!gameStarted) return;
    if (isHost) {
        leftY = Math.min(canvas.height - paddleHeight, leftY + paddleSpeed);
    } else {
        rightY = Math.min(canvas.height - paddleHeight, rightY + paddleSpeed);
        send({ type: 'paddle', y: rightY });
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { e.preventDefault(); moveUp(); }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); moveDown(); }
    // Speed control with +/- keys
    if (e.key === '+' || e.key === '=') { paddleSpeed = Math.min(paddleSpeed + 2, 20); showSpeedMsg(); }
    if (e.key === '-' || e.key === '_') { paddleSpeed = Math.max(paddleSpeed - 2, 4); showSpeedMsg(); }
});

function showSpeedMsg() {
    gameStatus.textContent = 'SPEED: ' + paddleSpeed;
    setTimeout(() => {
        if (gameStarted) {
            gameStatus.textContent = isHost ? '< YOU ARE LEFT PADDLE >' : '< YOU ARE RIGHT PADDLE >';
        }
    }, 1000);
}

// Mouse control for paddle
canvas.addEventListener('mousemove', (e) => {
    if (!gameStarted) return;
    const rect = canvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const targetY = mouseY - paddleHeight / 2;
    const clampedY = Math.max(0, Math.min(canvas.height - paddleHeight, targetY));
    
    if (isHost) {
        leftY = clampedY;
    } else {
        rightY = clampedY;
        send({ type: 'paddle', y: rightY });
    }
});

// Touch move on canvas for mobile
canvas.addEventListener('touchmove', (e) => {
    if (!gameStarted) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const touchY = e.touches[0].clientY - rect.top;
    const targetY = touchY - paddleHeight / 2;
    const clampedY = Math.max(0, Math.min(canvas.height - paddleHeight, targetY));
    
    if (isHost) {
        leftY = clampedY;
    } else {
        rightY = clampedY;
        send({ type: 'paddle', y: rightY });
    }
}, { passive: false });

const upBtn = document.getElementById('upBtn');
const downBtn = document.getElementById('downBtn');
let upInterval, downInterval;
// Keyboard hold/repeat for paddle movement
let keyUpHeld = false, keyDownHeld = false;
let keyUpInterval, keyDownInterval;

function startKeyUp() {
    if (!keyUpHeld) {
        keyUpHeld = true;
        moveUp();
        keyUpInterval = setInterval(moveUp, 30);
    }
}
function stopKeyUp() {
    keyUpHeld = false;
    clearInterval(keyUpInterval);
}
function startKeyDown() {
    if (!keyDownHeld) {
        keyDownHeld = true;
        moveDown();
        keyDownInterval = setInterval(moveDown, 30);
    }
}
function stopKeyDown() {
    keyDownHeld = false;
    clearInterval(keyDownInterval);
}

window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { e.preventDefault(); startKeyUp(); }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); startKeyDown(); }
});
window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { stopKeyUp(); }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { stopKeyDown(); }
});

upBtn.addEventListener('touchstart', (e) => { e.preventDefault(); moveUp(); upInterval = setInterval(moveUp, 30); });
upBtn.addEventListener('touchend', () => clearInterval(upInterval));
upBtn.addEventListener('mousedown', () => { moveUp(); upInterval = setInterval(moveUp, 30); });
upBtn.addEventListener('mouseup', () => clearInterval(upInterval));
upBtn.addEventListener('mouseleave', () => clearInterval(upInterval));

downBtn.addEventListener('touchstart', (e) => { e.preventDefault(); moveDown(); downInterval = setInterval(moveDown, 30); });
downBtn.addEventListener('touchend', () => clearInterval(downInterval));
downBtn.addEventListener('mousedown', () => { moveDown(); downInterval = setInterval(moveDown, 30); });
downBtn.addEventListener('mouseup', () => clearInterval(downInterval));
downBtn.addEventListener('mouseleave', () => clearInterval(downInterval));

// Fixed timestep game loop for consistent physics
let accumulator = 0;

function gameLoop(currentTime) {
    if (lastTime === 0) lastTime = currentTime;
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    
    // Accumulate time and run physics in fixed steps
    accumulator += deltaTime;
    
    // Prevent spiral of death
    if (accumulator > 200) accumulator = 200;
    
    while (accumulator >= FIXED_DT) {
        update();
        accumulator -= FIXED_DT;
    }
    
    draw();
    requestAnimationFrame(gameLoop);
}

initGameState();
requestAnimationFrame(gameLoop);
