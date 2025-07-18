// Firebase SDK 가져오기
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, limit, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase 설정 ---
const firebaseConfig = {
  apiKey: "AIzaSyDHG0wXgCTjGcgfzNrI8LDg2DjvjsZ4eqw",
  authDomain: "black2-2f5eb.firebaseapp.com",
  projectId: "black2-2f5eb",
  storageBucket: "black2-2f5eb.firebasestorage.app",
  messagingSenderId: "381668862234",
  appId: "1:381668862234:web:7a8cb1fcff6fa762b124a3",
  measurementId: "G-G56KTX4LZ6"
};

let db, auth;
let scoresCollection;

async function initializeFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        await signInAnonymously(auth);
        scoresCollection = collection(db, "scores");
        console.log("Firebase initialized and user signed in successfully.");
    } catch (e) {
        console.error("Firebase 초기화 실패:", e);
    }
}

// --- 게임 요소 가져오기 ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 게임 상태 변수 ---
let gameState = {
    score: 0,
    lives: 1,
    level: 1,
    paused: false,
    gameOver: false,
    gameStarted: false, // ✨ 게임 시작 상태 추가
    multiBallSlowdownActive: false, // ✨ 볼 복제 감속 효과 상태
    ballSpeed: 4,
    paddleSpeed: 8,
    slowMotionTime: 0,
    paddleExpandTime: 0,
    playTime: 0 // ✨ 플레이 시간 저장 속성 추가
};

// --- 게임 객체 ---
const paddle = {
    x: canvas.width / 2 - 75,
    y: canvas.height - 30,
    width: 150,
    height: 15,
    speed: 8,
    originalWidth: 150
};

const balls = [];
const bricks = [];
const items = [];
const particles = [];

// --- 게임 설정 ---
const brickRowCount = 6;
const brickColumnCount = 12;
const brickWidth = 60;
const brickHeight = 20;
const brickPadding = 5;
const brickOffsetTop = 50;
const brickOffsetLeft = 35;
const brickColors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43'];
const itemTypes = [
    { type: 'slow', color: '#48dbfb', symbol: '🔵', effect: 'slowMotion' },
    { type: 'clearRow', color: '#feca57', symbol: '🟡', effect: 'clearRow' },
    { type: 'clearColor', color: '#00d2d3', symbol: '🟢', effect: 'clearColor' },
    { type: 'multiBall', color: '#ff6b6b', symbol: '🔴', effect: 'multiBall' },
    { type: 'expandPaddle', color: '#ff9ff3', symbol: '🟣', effect: 'expandPaddle' },
    { type: 'extraLife', color: '#32ff32', symbol: '💚', effect: 'extraLife' }
];
let stageItemsDropped = 0;
const itemsPerStage = 2;
let lifeItemDropped = false;
let keys = {};
let mouseX = 0;
let itemMessage = '';
let itemMessageTime = 0;
let gameStartTime; // ✨ 게임 시작 시간 변수 선언

// --- 이벤트 리스너 설정 ---

// (새로 추가) 게임 시작 버튼
document.getElementById('startGameBtn').addEventListener('click', () => {
    document.getElementById('start-menu').style.display = 'none';
    gameState.gameStarted = true;
    initGame(); // 게임 초기화 및 시작
});


document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ') {
        e.preventDefault();
        if (!gameState.gameOver) gameState.paused = !gameState.paused;
    }
});
document.addEventListener('keyup', (e) => { keys[e.key] = false; });
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
});
document.getElementById('submitScoreBtn').addEventListener('click', async () => {
    const playerNameInput = document.getElementById('playerName');
    const playerName = playerNameInput.value.trim();
    if (playerName) {
        await saveScore(playerName); // ✨ 인자 변경
        document.getElementById('name-prompt').style.display = 'none';
        await displayLeaderboard();
    } else {
        alert('이름을 입력해주세요.');
    }
});
document.getElementById('restartBtn').addEventListener('click', () => {
    restartGame();
});

// --- 게임 로직 함수들 ---
function createBricks() {
    bricks.length = 0;
    stageItemsDropped = 0;
    lifeItemDropped = false;
    for (let r = 0; r < brickRowCount; r++) {
        for (let c = 0; c < brickColumnCount; c++) {
            if (gameState.level > 1 && Math.random() < 0.5) {
                continue;
            }
            bricks.push({
                x: c * (brickWidth + brickPadding) + brickOffsetLeft,
                y: r * (brickHeight + brickPadding) + brickOffsetTop,
                width: brickWidth, height: brickHeight,
                color: brickColors[r % brickColors.length],
                colorIndex: r % brickColors.length,
                row: r, visible: true, points: (brickRowCount - r) * 10
            });
        }
    }
    if (gameState.level > 1 && bricks.length === 0) {
        createBricks();
    }
}

function createItem(x, y, forceType = null) {
    let itemType;
    if (forceType) {
        itemType = itemTypes.find(type => type.type === forceType);
    } else {
        if (stageItemsDropped >= itemsPerStage) return;
        const regularItems = itemTypes.filter(type => type.type !== 'extraLife');
        itemType = regularItems[Math.floor(Math.random() * regularItems.length)];
    }
    if (!itemType) return;
    items.push({
        x, y, width: 30, height: 30, dy: 2,
        type: itemType.type, color: itemType.color, symbol: itemType.symbol, effect: itemType.effect
    });
    if (!forceType) stageItemsDropped++;
}

function createLifeItem() {
    if (items.length === 0 && gameState.level % 3 === 0 && !lifeItemDropped) {
        const visibleBricks = bricks.filter(brick => brick.visible);
        if (visibleBricks.length > 0) {
            const randomBrick = visibleBricks[Math.floor(Math.random() * visibleBricks.length)];
            createItem(randomBrick.x + randomBrick.width / 2, randomBrick.y + randomBrick.height / 2, 'extraLife');
            lifeItemDropped = true;
        }
    }
}

function applyItemEffect(item) {
    switch(item.effect) {
        case 'slowMotion': gameState.slowMotionTime = 300; break;
        case 'clearRow': {
            const randomRow = Math.floor(Math.random() * brickRowCount);
            let cleared = false;
            bricks.forEach(brick => {
                if (brick.row === randomRow && brick.visible) {
                    brick.visible = false;
                    gameState.score += brick.points;
                    createParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color);
                    cleared = true;
                }
            });
            if (cleared) showItemMessage('한 줄 제거!');
            break;
        }
        case 'clearColor': {
            const randomColor = Math.floor(Math.random() * brickColors.length);
            let cleared = false;
            bricks.forEach(brick => {
                if (brick.colorIndex === randomColor && brick.visible) {
                    brick.visible = false;
                    gameState.score += brick.points;
                    createParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color);
                    cleared = true;
                }
            });
            if (cleared) showItemMessage('같은 색 제거!');
            break;
        }
        case 'multiBall':
            if (balls.length < 5) {
                const originalBall = balls[0] || {x: paddle.x, y: paddle.y, dx: 4, dy: -4};
                balls.push({
                    x: originalBall.x, y: originalBall.y, radius: 8,
                    dx: -originalBall.dx + (Math.random() - 0.5),
                    dy: originalBall.dy + (Math.random() - 0.5),
                    trail: []
                });
                showItemMessage('볼 복제!');
            }
            break;
        case 'expandPaddle':
            gameState.paddleExpandTime = 600;
            paddle.width = paddle.originalWidth * 1.5;
            showItemMessage('패들 확장!');
            break;
        case 'extraLife':
            gameState.lives++;
            showItemMessage('생명 증가!');
            break;
    }
}

function showItemMessage(message) {
    itemMessage = message;
    itemMessageTime = 120;
}

function checkCollision(ball, rect) {
    return ball.x + ball.radius > rect.x && ball.x - ball.radius < rect.x + rect.width &&
           ball.y + ball.radius > rect.y && ball.y - ball.radius < rect.y + rect.height;
}

function createParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
        particles.push({
            x, y,
            dx: (Math.random() - 0.5) * 8,
            dy: (Math.random() - 0.5) * 8,
            color, life: 30, maxLife: 30
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.dx; p.y += p.dy; p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function update() {
    if (!gameState.gameStarted || gameState.paused || gameState.gameOver) return;

    if (gameState.slowMotionTime > 0) gameState.slowMotionTime--;
    if (gameState.paddleExpandTime > 0) {
        gameState.paddleExpandTime--;
        if (gameState.paddleExpandTime === 0) paddle.width = paddle.originalWidth;
    }
    if (itemMessageTime > 0) itemMessageTime--;

    const timeMultiplier = gameState.slowMotionTime > 0 ? 0.5 : 1;

    if (keys['ArrowLeft'] && paddle.x > 0) paddle.x -= paddle.speed;
    if (keys['ArrowRight'] && paddle.x < canvas.width - paddle.width) paddle.x += paddle.speed;

    if (mouseX > 0) {
        paddle.x = mouseX - paddle.width / 2;
        paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
    }

    for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];
        ball.x += ball.dx * timeMultiplier;
        ball.y += ball.dy * timeMultiplier;

        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 5) ball.trail.shift();

        if (ball.x + ball.radius > canvas.width || ball.x - ball.radius < 0) ball.dx = -ball.dx;
        if (ball.y - ball.radius < 0) ball.dy = -ball.dy;

        if (ball.y + ball.radius > canvas.height) {
            balls.splice(i, 1);
            continue;
        }

if (checkCollision(ball, paddle)) {
    // ✨ 볼 복제 감속 효과가 활성화 상태이면 원래 속도로 복구
    if (gameState.multiBallSlowdownActive) {
        gameState.multiBallSlowdownActive = false;

        balls.forEach(b => {
            const currentSpeed = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
            if (currentSpeed > 0) {
                 const speedRatio = gameState.ballSpeed / currentSpeed;
                 b.dx *= speedRatio;
                 b.dy *= speedRatio;
            }
        });
    }

    // 기존 패들 충돌 로직
    const paddleCenter = paddle.x + paddle.width / 2;
    const difference = ball.x - paddleCenter;
    const normalizedDifference = difference / (paddle.width / 2);
    ball.dy = -Math.abs(ball.dy);
    ball.dx += normalizedDifference * 2;
    const maxSpeed = 8;
    if (Math.abs(ball.dx) > maxSpeed) ball.dx = Math.sign(ball.dx) * maxSpeed;
}

        for (let j = 0; j < bricks.length; j++) {
            const brick = bricks[j];
            if (brick.visible && checkCollision(ball, brick)) {
                brick.visible = false;
                ball.dy = -ball.dy;
                gameState.score += brick.points;
                createParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color);
                
                if (items.length === 0 && Math.random() < 0.3 && stageItemsDropped < itemsPerStage) {
                    createItem(brick.x + brick.width / 2, brick.y + brick.height / 2);
                }
                
                createLifeItem();
                
                if (bricks.filter(b => b.visible).length === 0) {
                    nextLevel();
                }
                break;
            }
        }
    }

    if (balls.length === 0) {
        gameState.lives--;
        if (gameState.lives <= 0) {
            gameState.gameOver = true;
            // ✨ 게임 오버 시 플레이 시간 계산
            const endTime = Date.now();
            const elapsedSeconds = Math.floor((endTime - gameStartTime) / 1000);
            gameState.playTime = elapsedSeconds;
            showNamePrompt();
        } else {
            resetBalls();
        }
    }

    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.y += item.dy;
        if (checkCollision({x: item.x, y: item.y, radius: 15}, paddle)) {
            applyItemEffect(item);
            items.splice(i, 1);
            continue;
        }
        if (item.y > canvas.height) items.splice(i, 1);
    }

    updateParticles();
    updateUI();
}

function resetBalls() {
    balls.length = 0;
    balls.push({
        x: canvas.width / 2, y: canvas.height / 2, radius: 8,
        dx: (Math.random() > 0.5 ? 1 : -1) * gameState.ballSpeed,
        dy: -gameState.ballSpeed,
        trail: []
    });
}

function nextLevel() {
    gameState.level++;
    gameState.ballSpeed += 0.5;
    gameState.paddleSpeed += 0.5;
    
    balls.forEach(ball => {
        const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
        const speedRatio = gameState.ballSpeed / currentSpeed;
        ball.dx *= speedRatio;
        ball.dy *= speedRatio;
    });
    
    createBricks();
    resetBalls();
    
    gameState.slowMotionTime = 0;
    gameState.paddleExpandTime = 0;
    paddle.width = paddle.originalWidth;
    items.length = 0;
}

// --- 그리기 함수들 ---
function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        ctx.save();
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawBricks() {
    bricks.forEach(brick => {
        if (brick.visible) {
            ctx.save();
            ctx.fillStyle = brick.color;
            ctx.shadowColor = brick.color;
            ctx.shadowBlur = 10;
            ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(brick.x, brick.y, brick.width, 3);
            ctx.restore();
        }
    });
}

function drawPaddle() {
    ctx.save();
    ctx.shadowColor = gameState.paddleExpandTime > 0 ? '#ff9ff3' : '#fff';
    ctx.shadowBlur = gameState.paddleExpandTime > 0 ? 20 : 15;
    const gradient = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(1, '#ccc');
    ctx.fillStyle = gradient;
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    ctx.restore();
}

function drawBalls() {
    balls.forEach(ball => {
        ball.trail.forEach((point, index) => {
            ctx.save();
            ctx.globalAlpha = (index + 1) / ball.trail.length * 0.3;
            ctx.fillStyle = '#48dbfb';
            ctx.beginPath();
            ctx.arc(point.x, point.y, ball.radius * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        ctx.save();
        ctx.fillStyle = '#48dbfb';
        ctx.shadowColor = '#48dbfb';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(ball.x - 2, ball.y - 2, ball.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function drawItems() {
    items.forEach(item => {
        ctx.save();
        ctx.fillStyle = item.color;
        ctx.shadowColor = item.color;
        ctx.shadowBlur = 15;
        ctx.fillRect(item.x - item.width/2, item.y - item.height/2, item.width, item.height);
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(item.symbol, item.x, item.y + 7);
        ctx.restore();
    });
}

function drawUI() {
    if (gameState.slowMotionTime > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(72, 219, 251, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    if (itemMessageTime > 0) {
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 5;
        ctx.fillText(itemMessage, canvas.width / 2, canvas.height / 2 - 50);
        ctx.restore();
    }

    if (gameState.paused) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('일시정지', canvas.width / 2, canvas.height / 2);
        ctx.restore();
    }
}

// --- 메인 게임 루프 ---
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    update();
    drawBricks();
    drawPaddle();
    drawBalls();
    drawItems();
    drawParticles();
    drawUI();
    requestAnimationFrame(gameLoop);
}

function updateUI() {
    document.getElementById('score').textContent = gameState.score;
    document.getElementById('lives').textContent = gameState.lives;
    document.getElementById('level').textContent = gameState.level;
}

// --- 랭킹 및 게임 관리 함수 ---

// ✨ 초를 'M분 S초' 형식으로 변환하는 함수
function formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '0초';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}분 ${seconds}초`;
}

async function saveScore(name) {
    if (!scoresCollection) {
        console.error("Firestore is not initialized.");
        return;
    }
    try {
        // ✨ score, level, playTime을 gameState에서 직접 가져와 저장
        await addDoc(scoresCollection, {
            name: name,
            score: gameState.score,
            level: gameState.level,
            playTime: gameState.playTime,
            createdAt: new Date()
        });
        console.log("점수 저장 성공!");
    } catch (error) {
        console.error("점수 저장 실패: ", error);
    }
}

async function displayLeaderboard() {
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '<li>랭킹을 불러오는 중...</li>';
    if (!scoresCollection) {
        leaderboardList.innerHTML = '<li>랭킹 시스템에 연결할 수 없습니다.</li>';
        return;
    }
    try {
        const q = query(scoresCollection, orderBy("score", "desc"), limit(10));
        const querySnapshot = await getDocs(q);
        const scores = [];
        querySnapshot.forEach((doc) => scores.push(doc.data()));

        leaderboardList.innerHTML = ''; // 목록 비우기

// ...
        // ✨ 랭킹 헤더 추가 (수정)
        const header = document.createElement('li');
        header.classList.add('leaderboard-header');
        // 각 span에 클래스를 추가하여 데이터와 정렬을 맞춥니다.
        header.innerHTML = `
            <span class="rank">순위</span>
            <span class="name">이름</span>
            <span class="level">레벨</span>
            <span class="score">점수</span>
            <span class="playTime">플레이 시간</span>
        `;
        leaderboardList.appendChild(header);
// ...

        if (scores.length === 0) {
            leaderboardList.innerHTML += '<li>아직 등록된 랭킹이 없습니다.</li>';
        } else {
            scores.forEach((entry, index) => {
                const li = document.createElement('li');
                // ✨ level과 playTime을 표시하도록 innerHTML 수정
                li.innerHTML = `
                    <span class="rank">${index + 1}</span>
                    <span class="name">${escapeHTML(entry.name)}</span>
                    <span class="level">Lv.${entry.level || 1}</span>
                    <span class="score">${entry.score}</span>
                    <span class="playTime">${formatTime(entry.playTime || 0)}</span>
                `;
                leaderboardList.appendChild(li);
            });
        }
    } catch (error) {
        console.error("랭킹 불러오기 실패: ", error);
        leaderboardList.innerHTML = '<li>랭킹을 불러오는 데 실패했습니다.</li>';
    }
    document.getElementById('finalScore').textContent = gameState.score;
    document.getElementById('gameOver').style.display = 'block';
}

function showNamePrompt() {
    document.getElementById('name-prompt').style.display = 'block';
}

function escapeHTML(str) {
    return str.replace(/[&<>"']/g, match => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[match]);
}

function restartGame() {
    Object.assign(gameState, {
        score: 0, lives: 1, level: 1, paused: false, gameOver: false,
        ballSpeed: 4, paddleSpeed: 8, slowMotionTime: 0, paddleExpandTime: 0, // ✨ 4 -> 6으로 수정
        playTime: 0 // ✨ 플레이 시간 초기화
    });
    Object.assign(paddle, { x: canvas.width / 2 - 75, width: paddle.originalWidth });
    items.length = 0;
    particles.length = 0;
    createBricks();
    resetBalls();
    updateUI();
    gameStartTime = Date.now(); // ✨ 다시 시작할 때 시간 초기화
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('name-prompt').style.display = 'none';
}

function initGame() {
    createBricks();
    resetBalls();
    updateUI();
    gameStartTime = Date.now(); // ✨ 최초 게임 시작 시간 기록
    gameLoop();
}

// --- 게임 시작 ---
initializeFirebase();
gameLoop();