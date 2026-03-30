// --- GAME CONSTANTS & STATE ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let cw, ch;
let isPlaying = false;
let isPaused = false;
let gameLoopId;
let lastTime = 0;

// Game Systems
let player;
let bullets = [];
let enemies = [];
let particles = [];
let powerups = [];
let stars = [];

// Game Stats
let score = 0;
let level = 1;
let enemiesKilled = 0;
let enemiesToNextLevel = 10;
let powerupActive = null;
let powerupTimer = 0;

// Enemy Spawning Config
let spawnRateBase = 2000;
let spawnTimer = 0;
let spawnInterval = spawnRateBase;

// DOM Elements
const hud = document.getElementById('hud');
const scoreValue = document.getElementById('score-value');
const levelValue = document.getElementById('level-value');
const healthBarInner = document.getElementById('health-bar-inner');
const healthText = document.getElementById('health-text');
const enemiesValue = document.getElementById('enemies-value');
const powerupDisplay = document.getElementById('powerup-display');
const powerupValue = document.getElementById('powerup-value');

const screens = {
    start: document.getElementById('start-screen'),
    level: document.getElementById('level-screen'),
    gameover: document.getElementById('gameover-screen'),
    win: document.getElementById('win-screen'),
    leaderboard: document.getElementById('leaderboard-modal')
};

// Input State
const mouse = {
    x: undefined,
    y: undefined,
    isDown: false
};

// --- AUDIO SYSTEM (Web Audio API synthesis) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const audio = {
    enabled: true,
    playTone: (freq, type, duration, vol = 0.1, slide = 0) => {
        if (!audio.enabled || audioCtx.state === 'suspended') return;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        if (slide !== 0) {
            osc.frequency.exponentialRampToValueAtTime(freq + slide, audioCtx.currentTime + duration);
        }

        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },
    shoot: () => audio.playTone(600, 'square', 0.1, 0.05, -300),
    hit: () => audio.playTone(150, 'sawtooth', 0.1, 0.08, -100),
    explosion: () => {
        // Noise burst using oscillator for a simple impl
        audio.playTone(100, 'square', 0.3, 0.1, -80);
        setTimeout(() => audio.playTone(50, 'sawtooth', 0.4, 0.1, -40), 50);
    },
    powerup: () => {
        audio.playTone(400, 'sine', 0.1, 0.1, 200);
        setTimeout(() => audio.playTone(600, 'sine', 0.2, 0.1, 400), 100);
    },
    damage: () => audio.playTone(100, 'sawtooth', 0.5, 0.2, -50),
    levelUp: () => {
        audio.playTone(440, 'sine', 0.2, 0.1);
        setTimeout(() => audio.playTone(554, 'sine', 0.2, 0.1), 200);
        setTimeout(() => audio.playTone(659, 'sine', 0.4, 0.1), 400);
    },
    gameOver: () => {
        audio.playTone(300, 'sawtooth', 0.5, 0.2, -150);
        setTimeout(() => audio.playTone(250, 'sawtooth', 0.5, 0.2, -100), 500);
        setTimeout(() => audio.playTone(200, 'sawtooth', 1.0, 0.2, -150), 1000);
    }
};

// --- INITIALIZATION ---
function resizeCanvas() {
    cw = canvas.width = window.innerWidth;
    ch = canvas.height = window.innerHeight;
    if (player) {
        player.x = cw / 2;
        player.y = ch / 2;
    }
    initStars();
}

// --- CLASSES ---
class Player {
    constructor() {
        this.x = cw / 2;
        this.y = ch / 2;
        this.radius = 18;
        this.color = '#00f0ff';
        this.health = 100;
        this.maxHealth = 100;
        this.speed = 7;
        this.lastShot = 0;
        this.fireRate = 250; // ms between shots
        this.angle = 0;
        this.targetX = this.x;
        this.targetY = this.y;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Airplane body / Fuselage
        ctx.beginPath();
        ctx.moveTo(this.radius * 1.5, 0); // Nose
        ctx.lineTo(this.radius * 0.5, this.radius * 0.3);
        ctx.lineTo(-this.radius * 0.8, this.radius * 0.4);
        ctx.lineTo(-this.radius * 1.2, this.radius * 0.2);
        ctx.lineTo(-this.radius * 1.2, -this.radius * 0.2);
        ctx.lineTo(-this.radius * 0.8, -this.radius * 0.4);
        ctx.lineTo(this.radius * 0.5, -this.radius * 0.3);
        ctx.closePath();
        
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fill();

        // Main Wings (Swept back delta wings)
        ctx.beginPath();
        // Right Wing (Positive Y in canvas is "down"/right)
        ctx.moveTo(this.radius * 0.2, this.radius * 0.35); // Root front
        ctx.lineTo(-this.radius * 0.5, this.radius * 1.8); // Tip front
        ctx.lineTo(-this.radius * 0.9, this.radius * 1.8); // Tip back
        ctx.lineTo(-this.radius * 0.6, this.radius * 0.4); // Root back
        
        // Left Wing
        ctx.moveTo(this.radius * 0.2, -this.radius * 0.35); // Root front
        ctx.lineTo(-this.radius * 0.5, -this.radius * 1.8); // Tip front
        ctx.lineTo(-this.radius * 0.9, -this.radius * 1.8); // Tip back
        ctx.lineTo(-this.radius * 0.6, -this.radius * 0.4); // Root back
        ctx.closePath();
        ctx.fillStyle = '#0088ff';
        ctx.fill();

        // Tail Fins
        ctx.beginPath();
        // Right tail
        ctx.moveTo(-this.radius * 0.7, this.radius * 0.35); // Root front
        ctx.lineTo(-this.radius * 1.3, this.radius * 1.0); // Tip front
        ctx.lineTo(-this.radius * 1.5, this.radius * 1.0); // Tip back
        ctx.lineTo(-this.radius * 1.1, this.radius * 0.2); // Root back
        // Left tail
        ctx.moveTo(-this.radius * 0.7, -this.radius * 0.35); // Root front
        ctx.lineTo(-this.radius * 1.3, -this.radius * 1.0); // Tip front
        ctx.lineTo(-this.radius * 1.5, -this.radius * 1.0); // Tip back
        ctx.lineTo(-this.radius * 1.1, -this.radius * 0.2); // Root back
        ctx.closePath();
        ctx.fillStyle = '#0088ff';
        ctx.fill();
        
        // Cockpit window
        ctx.beginPath();
        ctx.moveTo(this.radius * 0.8, 0);
        ctx.lineTo(this.radius * 0.2, this.radius * 0.2);
        ctx.lineTo(-this.radius * 0.2, this.radius * 0.2);
        ctx.lineTo(-this.radius * 0.2, -this.radius * 0.2);
        ctx.lineTo(this.radius * 0.2, -this.radius * 0.2);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.fill();

        // Engine glow
        if (mouse.x !== undefined || mouse.isDown) {
            ctx.beginPath();
            ctx.moveTo(-this.radius * 1.2, 0);
            ctx.lineTo(-this.radius * 2.5, 0);
            ctx.strokeStyle = '#ff9900';
            ctx.lineWidth = 6;
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ff0000';
            if (Math.random() > 0.3) ctx.stroke();
        }

        ctx.restore();

        // Shield effect
        if (powerupActive === 'shield') {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 2.2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 255, 136, 0.5)';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00ff88';
            ctx.stroke();
        }
    }

    update(dt) {
        // Move towards target (mouse/touch position)
        if (mouse.x !== undefined && mouse.y !== undefined) {
            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const dist = Math.hypot(dx, dy);

            // Set angle
            this.angle = Math.atan2(dy, dx);

            // Move only if far enough from cursor
            if (dist > this.speed) {
                this.x += (dx / dist) * this.speed * (dt / 16);
                this.y += (dy / dist) * this.speed * (dt / 16);
            }
        }

        // Keep in bounds
        this.x = Math.max(this.radius, Math.min(cw - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(ch - this.radius, this.y));

        // Handle shooting
        let currentFireRate = powerupActive === 'rapid' ? this.fireRate / 2 : this.fireRate;
        if (mouse.isDown && Date.now() - this.lastShot > currentFireRate) {
            this.shoot();
        }

        this.draw();
    }

    shoot() {
        // Calculate velocity based on angle
        const bulletSpeed = 12;
        const vx = Math.cos(this.angle) * bulletSpeed;
        const Vy = Math.sin(this.angle) * bulletSpeed; // Fixed variable scoping
        const vy = Math.sin(this.angle) * bulletSpeed;

        // Spawn bullet at nose (adjusted for the new airplane nose)
        const bx = this.x + Math.cos(this.angle) * (this.radius * 1.5);
        const by = this.y + Math.sin(this.angle) * (this.radius * 1.5);

        bullets.push(new Bullet(bx, by, vx, vy, this.angle));
        this.lastShot = Date.now();
        audio.shoot();
    }

    takeDamage(amount) {
        if (powerupActive === 'shield') return false; // Shield absorbs damage

        this.health -= amount;
        if (this.health < 0) this.health = 0;

        updateHUD();
        audio.damage();

        // Flash red
        this.color = '#ff003c';
        setTimeout(() => { if (this) this.color = '#00f0ff'; }, 100);

        // Screen shake effect
        document.body.style.transform = `translate(${Math.random() * 10 - 5}px, ${Math.random() * 10 - 5}px)`;
        setTimeout(() => document.body.style.transform = '', 50);

        if (this.health <= 0) {
            endGame(false);
            return true;
        }
        return false;
    }
}

class Bullet {
    constructor(x, y, vx, vy, angle) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.angle = angle;
        this.radius = 4;
        this.color = '#fff';
        this.markedForDeletion = false;

        if (powerupActive === 'rapid') {
            this.color = '#ff9900';
            this.radius = 5;
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.beginPath();
        // Laser shape
        ctx.moveTo(10, 0);
        ctx.lineTo(-5, -2);
        ctx.lineTo(-5, 2);
        ctx.closePath();

        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.restore();
    }

    update(dt) {
        this.x += this.vx * (dt / 16);
        this.y += this.vy * (dt / 16);

        // Out of bounds checkout
        if (this.x < -20 || this.x > cw + 20 || this.y < -20 || this.y > ch + 20) {
            this.markedForDeletion = true;
        }

        this.draw();
    }
}

class Enemy {
    constructor() {
        // Types: 0: basic, 1: fast, 2: tank
        // Probabilities based on level
        const rand = Math.random();
        if (level > 3 && rand < 0.2) this.type = 2; // Tank (20% at L4+)
        else if (level > 1 && rand < 0.5) this.type = 1; // Fast (30% at L2+)
        else this.type = 0; // Basic

        this.setupStats();

        // Apply level scaling
        this.hp += (level - 1) * this.hpScal;
        this.speed += (level - 1) * 0.2;

        // Spawn edge logic (outside canvas)
        const edge = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
        if (edge === 0) {
            this.x = Math.random() * cw;
            this.y = -this.radius;
        } else if (edge === 1) {
            this.x = cw + this.radius;
            this.y = Math.random() * ch;
        } else if (edge === 2) {
            this.x = Math.random() * cw;
            this.y = ch + this.radius;
        } else {
            this.x = -this.radius;
            this.y = Math.random() * ch;
        }

        this.markedForDeletion = false;
        this.wobbleOffset = Math.random() * Math.PI * 2;
    }

    setupStats() {
        switch (this.type) {
            case 1: // Fast (small, quick, low HP)
                this.radius = 12;
                this.color = '#ff003c';
                this.hp = 1;
                this.hpScal = 0.5;
                this.speed = 3.5;
                this.scoreVal = 20;
                this.damage = 10;
                break;
            case 2: // Tank (large, slow, high HP)
                this.radius = 28;
                this.color = '#b000ff';
                this.hp = 5;
                this.hpScal = 2;
                this.speed = 1.0;
                this.scoreVal = 50;
                this.damage = 30;
                break;
            default: // Basic (medium everything)
                this.radius = 18;
                this.color = '#ff9900';
                this.hp = 2;
                this.hpScal = 1;
                this.speed = 2.0;
                this.scoreVal = 10;
                this.damage = 15;
                break;
        }
    }

    draw() {
        ctx.beginPath();
        // Geometry depends on type
        if (this.type === 1) { // Triangle
            ctx.moveTo(this.x, this.y - this.radius);
            ctx.lineTo(this.x - this.radius, this.y + this.radius);
            ctx.lineTo(this.x + this.radius, this.y + this.radius);
        } else if (this.type === 2) { // Hexagon
            for (let i = 0; i < 6; i++) {
                const a = i * Math.PI / 3;
                if (i === 0) ctx.moveTo(this.x + this.radius * Math.cos(a), this.y + this.radius * Math.sin(a));
                else ctx.lineTo(this.x + this.radius * Math.cos(a), this.y + this.radius * Math.sin(a));
            }
        } else { // Square
            ctx.rect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        }

        ctx.closePath();

        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.stroke();

        // Fill slightly
        ctx.fillStyle = 'rgba(' + this.hexToRgb(this.color) + ', 0.2)';
        ctx.fill();
    }

    update(dt) {
        if (!player) return;

        // Move towards player
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);

        // Add some jitter/wobble logic based on type
        let moveX = (dx / dist) * this.speed;
        let moveY = (dy / dist) * this.speed;

        if (this.type === 1) { // Fast ones zig-zag slightly
            const wobble = Math.sin(Date.now() / 150 + this.wobbleOffset) * 2;
            const perpX = -dy / dist;
            const perpY = dx / dist;
            moveX += perpX * wobble;
            moveY += perpY * wobble;
        }

        this.x += moveX * (dt / 16);
        this.y += moveY * (dt / 16);

        this.draw();
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ?
            `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
            : '255, 255, 255';
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.radius = Math.random() * 3 + 1;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    update(dt) {
        this.vx *= 0.95; // Friction
        this.vy *= 0.95;
        this.x += this.vx * (dt / 16);
        this.y += this.vy * (dt / 16);
        this.life -= this.decay * (dt / 16);

        if (this.life > 0) this.draw();
    }
}

class PowerUp {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 15;
        this.markedForDeletion = false;

        // 0: Heal, 1: Rapid Fire, 2: Shield
        const r = Math.random();
        if (r < 0.4) {
            this.type = 'heal';
            this.color = '#00ff88';
            this.text = '+';
        } else if (r < 0.7) {
            this.type = 'rapid';
            this.color = '#ff9900';
            this.text = '»';
        } else {
            this.type = 'shield';
            this.color = '#00f0ff';
            this.text = 'O';
        }

        this.pulseAngle = 0;
        this.life = 500; // Despawns after time
    }

    draw() {
        this.pulseAngle += 0.1;
        const pulse = Math.abs(Math.sin(this.pulseAngle)) * 5;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + pulse, 0, Math.PI * 2);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.stroke();

        // Fill
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${this.type === 'heal' ? '0,255,136' : this.type === 'rapid' ? '255,153,0' : '0,240,255'}, 0.3)`;
        ctx.fill();

        // Text icon
        ctx.fillStyle = '#fff';
        ctx.font = '20px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 0;
        ctx.fillText(this.text, this.x, this.y + 2);
    }

    update(dt) {
        this.life -= (dt / 16);
        if (this.life <= 0) this.markedForDeletion = true;
        else this.draw();
    }
}

class Star {
    constructor() {
        this.reset(true);
    }

    reset(randomY = false) {
        this.x = Math.random() * cw;
        this.y = randomY ? Math.random() * ch : 0;
        this.size = Math.random() * 2;
        this.speed = (Math.random() * 2 + 0.5) * (this.size / 2); // Parallax effect
        this.alpha = Math.random() * 0.5 + 0.1;
    }

    draw() {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }

    update(dt) {
        this.y += this.speed * (dt / 16);
        if (this.y > ch) this.reset();
        this.draw();
    }
}

// --- GAME LOGIC ---
function initStars() {
    stars = [];
    for (let i = 0; i < 150; i++) {
        stars.push(new Star());
    }
}

function spawnEnemy() {
    if (!isPlaying || isPaused) return;
    enemies.push(new Enemy());

    // Decrease spawn interval as level progresses
    spawnInterval = Math.max(500, spawnRateBase - (level * 250));
}

function createExplosion(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
    audio.explosion();
}

function activatePowerup(type) {
    audio.powerup();
    if (type === 'heal') {
        player.health = Math.min(player.maxHealth, player.health + 30);
    } else {
        powerupActive = type;
        powerupTimer = 10000; // 10 seconds duration
        powerupDisplay.classList.remove('hidden');
        powerupValue.textContent = type === 'shield' ? 'SHIELD' : 'RAPID FIRE';
    }
    updateHUD();
}

function setScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if (screenName && screens[screenName]) {
        screens[screenName].classList.remove('hidden');
    }

    // Hide HUD on menus implicitly via z-index
    if (screenName === 'start' || screenName === 'leaderboard') {
        hud.classList.add('hidden');
    } else if (screenName === 'gameover' || screenName === 'win' || screenName === 'level') {
        hud.classList.remove('hidden'); // keep hud visible under overlays
    }
}

function levelCompletedCheck() {
    if (enemiesKilled >= enemiesToNextLevel * level && level < 5) {
        level++;
        enemiesKilled = 0;
        updateHUD();
        nextLevelInit();
    } else if (level === 5 && enemiesKilled >= enemiesToNextLevel * 5) {
        endGame(true);
    }
}

function nextLevelInit() {
    isPaused = true;
    audio.levelUp();

    // Clear field
    bullets = [];
    enemies = [];
    powerups = [];

    // Show splash
    document.getElementById('level-title').textContent = `LEVEL ${level}`;
    let subtitle = level === 5 ? "Final Stand" : "Enemy activity increasing";
    document.getElementById('level-subtitle').textContent = subtitle;

    setScreen('level');

    setTimeout(() => {
        setScreen('');
        hud.classList.remove('hidden');
        isPaused = false;
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    }, 2500);
}

function updateHUD() {
    scoreValue.textContent = score;
    levelValue.textContent = level;
    enemiesValue.textContent = `${enemiesKilled} / ${enemiesToNextLevel * level}`;

    const hpPercent = (player.health / player.maxHealth) * 100;
    healthBarInner.style.width = `${hpPercent}%`;
    healthText.textContent = `${Math.ceil(hpPercent)}%`;

    if (hpPercent <= 25) {
        healthBarInner.classList.add('warning');
    } else {
        healthBarInner.classList.remove('warning');
    }

    if (powerupTimer <= 0) {
        powerupDisplay.classList.add('hidden');
        powerupActive = null;
    }
}

// --- MAIN LOOP ---
function gameLoop(timestamp) {
    if (!isPlaying) return;

    const dt = timestamp - lastTime;
    lastTime = timestamp;

    // Clear canvas & draw background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, cw, ch);

    // Update stars
    if (!isPaused) {
        stars.forEach(s => s.update(dt));
    } else {
        stars.forEach(s => s.draw()); // Just draw if paused
    }

    if (isPaused) {
        return; // Pause logic ends here unless waiting on timeout
    }

    // Powerup Timer Logic
    if (powerupActive && powerupTimer > 0) {
        powerupTimer -= dt;
        if (powerupTimer <= 0) updateHUD(); // deactivate
    }

    // Spawn Logic
    spawnTimer += dt;
    if (spawnTimer > spawnInterval) {
        spawnEnemy();
        spawnTimer = 0;
    }

    // Entities Updates
    player.update(dt);

    powerups.forEach((pu, index) => {
        pu.update(dt);
        if (pu.markedForDeletion) powerups.splice(index, 1);
    });

    bullets.forEach((bullet, bIndex) => {
        bullet.update(dt);
        if (bullet.markedForDeletion) bullets.splice(bIndex, 1);
    });

    particles.forEach((part, index) => {
        part.update(dt);
        if (part.life <= 0) particles.splice(index, 1);
    });

    enemies.forEach((enemy, eIndex) => {
        enemy.update(dt);

        // --- COLLISION LOGIC ---

        // Player vs Enemy
        const distToPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (distToPlayer < player.radius + enemy.radius) {
            enemy.markedForDeletion = true;
            createExplosion(enemy.x, enemy.y, enemy.color);
            player.takeDamage(enemy.damage);
        }

        // Bullet vs Enemy (optimizing with spatial checks can be done later if needed)
        bullets.forEach((bullet, bIndex) => {
            const dist = Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y);
            if (dist < enemy.radius + bullet.radius) {
                // Hit
                bullet.markedForDeletion = true;
                enemy.hp--;

                audio.hit();
                // Hit effect
                particles.push(new Particle(bullet.x, bullet.y, '#fff'));

                if (enemy.hp <= 0) {
                    enemy.markedForDeletion = true;
                    score += enemy.scoreVal;
                    enemiesKilled++;
                    createExplosion(enemy.x, enemy.y, enemy.color);

                    // Powerup drop chance
                    if (Math.random() < 0.1) {
                        powerups.push(new PowerUp(enemy.x, enemy.y));
                    }

                    updateHUD();
                    levelCompletedCheck();
                }
            }
        });

        if (enemy.markedForDeletion) {
            enemies.splice(eIndex, 1);
        }
    });

    // Player vs PowerUp
    powerups.forEach((pu, index) => {
        const dist = Math.hypot(player.x - pu.x, player.y - pu.y);
        if (dist < player.radius + pu.radius) {
            activatePowerup(pu.type);
            pu.markedForDeletion = true;
        }
    });

    gameLoopId = requestAnimationFrame(gameLoop);
}

// --- STATE MANAGEMENT ---
function startGame() {
    // Requires user interaction first to resume audiocontext
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // Reset stats
    score = 0;
    level = 1;
    enemiesKilled = 0;
    powerupActive = null;
    powerupTimer = 0;

    // Clear entities
    bullets = [];
    enemies = [];
    particles = [];
    powerups = [];

    player = new Player();

    setScreen(''); // Hide all screens
    hud.classList.remove('hidden');

    updateHUD();

    isPlaying = true;
    isPaused = false;
    lastTime = performance.now();
    spawnTimer = 0;

    // Only call loop if not already running
    cancelAnimationFrame(gameLoopId);
    gameLoop(lastTime);
}

function endGame(won) {
    isPlaying = false;
    cancelAnimationFrame(gameLoopId);

    if (won) {
        document.getElementById('win-score').textContent = score;
        setScreen('win');
    } else {
        audio.gameOver();
        document.getElementById('final-score').textContent = score;
        document.getElementById('final-level').textContent = level;
        setScreen('gameover');
    }
}

// --- LEADERBOARD & LOCALSTORAGE ---
function saveScore(inputElementId) {
    const nameInput = document.getElementById(inputElementId);
    const name = nameInput.value.trim().toUpperCase() || 'ANON';

    // Retrieve existing
    let highscores = JSON.parse(localStorage.getItem('nebulaHighscores')) || [];

    highscores.push({ name, score, level });

    // Sort descending
    highscores.sort((a, b) => b.score - a.score);
    // Keep top 10
    highscores = highscores.slice(0, 10);

    localStorage.setItem('nebulaHighscores', JSON.stringify(highscores));

    showLeaderboard();
}

function showLeaderboard() {
    setScreen('leaderboard');

    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';

    let highscores = JSON.parse(localStorage.getItem('nebulaHighscores')) || [];

    if (highscores.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#888;">NO DATA RECORDED</p>';
        return;
    }

    highscores.forEach((entry, idx) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.innerHTML = `
            <span>${idx + 1}. ${entry.name}</span>
            <span>${entry.score} (L${entry.level})</span>
        `;
        list.appendChild(item);
    });
}

// --- INPUT LISTENERS ---
window.addEventListener('resize', resizeCanvas);

// Mouse
window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});
window.addEventListener('mousedown', (e) => {
    // Resume audio context
    if (audioCtx.state === 'suspended') audioCtx.resume();

    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.isDown = true;
});
window.addEventListener('mouseup', () => mouse.isDown = false);
window.addEventListener('mouseleave', () => mouse.isDown = false);

// Touch support
canvas.addEventListener('touchstart', (e) => {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const touch = e.touches[0];
    mouse.x = touch.clientX;
    mouse.y = touch.clientY;
    mouse.isDown = true;
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    mouse.x = touch.clientX;
    mouse.y = touch.clientY;
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    mouse.isDown = false;
    e.preventDefault();
}, { passive: false });

// Keyboard (Escape to pause)
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPlaying && screens.level.classList.contains('hidden')) {
        isPaused = !isPaused;
        const ind = document.getElementById('pause-indicator');
        if (isPaused) ind.classList.remove('hidden');
        else {
            ind.classList.add('hidden');
            lastTime = performance.now(); // Prevent large dt
        }
    }
});

// UI Buttons Listeners
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('win-restart-btn').addEventListener('click', startGame);

document.getElementById('save-score-btn').addEventListener('click', () => saveScore('player-name'));
document.getElementById('win-save-btn').addEventListener('click', () => saveScore('win-player-name'));

document.getElementById('leaderboard-btn').addEventListener('click', showLeaderboard);
document.getElementById('close-leaderboard-btn').addEventListener('click', () => setScreen('start'));

// --- BOOT ---
resizeCanvas();
initStars();
// Draw idle background
function idleLoop() {
    if (!isPlaying) {
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, cw, ch);
        stars.forEach(s => s.update(16));
        requestAnimationFrame(idleLoop);
    }
}
idleLoop();
setScreen('start'); // Initial state
