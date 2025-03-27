const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mCtx = minimap.getContext('2d');

// Canvas-Größe an Fenster anpassen
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
// Minimap-Größe basierend auf Bildschirmbreite
minimap.width = window.innerWidth > 768 ? 200 : window.innerWidth > 576 ? 150 : 100;
minimap.height = window.innerWidth > 768 ? 150 : window.innerWidth > 576 ? 100 : 75;

// Weltgröße definieren
const WORLD_WIDTH = 12000;
const WORLD_HEIGHT = 12000;

// Spieler-Objekt mit Startwerten
let player = {
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    size: 30,
    speed: 3,
    health: 100,
    oxygen: 100,
    metal: 0,
    fuel: 0,
    energy: 0,
    weaponLevel: 1,
    angle: 0,
    jetpackFrame: 0
};

// Kamera- und Raketen-Objekte
let camera = { x: 0, y: 0 };
let rocket = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, progress: 0, radius: 100, upgradeLevel: 0, stage: 0 };
// Arrays für Spielobjekte
let enemies = [];
let resources = [];
let particles = [];
let projectiles = [];
let towers = [];
// Spielzustandsvariablen
let isNight = false;
let nightCount = 0;
let gameTime = 0;
let gameRunning = false;
const maxResources = 1000;

// UI aktualisieren
const updateUI = () => {
    document.getElementById('health').textContent = Math.round(player.health);
    document.getElementById('oxygen').textContent = Math.round(player.oxygen);
    document.getElementById('metal').textContent = player.metal;
    document.getElementById('fuel').textContent = player.fuel;
    document.getElementById('energy').textContent = player.energy;
    document.getElementById('rocket').textContent = rocket.progress + '%';
    document.getElementById('weapon').textContent = player.weaponLevel;
    document.getElementById('cycle').textContent = isNight ? 'Nacht' : 'Tag';
    document.getElementById('towers').textContent = towers.length;
    // Debug-Button für unbegrenzte Ressourcen
    document.getElementById('debugResources').addEventListener('click', () => {
        if (gameRunning) {
            player.metal = 999999999;
            player.fuel = 999999999;
            player.energy = 999999999;
            updateUI();
        }
    });

    const metalCost = 50 + rocket.upgradeLevel * 40;
    const fuelCost = 40 + rocket.upgradeLevel * 30;
    const energyCost = 30 + rocket.upgradeLevel * 20;
    document.getElementById('repairRocket').textContent = `Repair Rocket (${metalCost} Metal, ${fuelCost} Fuel, ${energyCost} Energy)`;
};

// Initiale Ressourcen spawnen
const spawnInitialResources = () => {
    resources = [];
    for (let i = 0; i < maxResources; i++) {
        const types = ['metal', 'fuel', 'energy'];
        const type = types[Math.floor(Math.random() * 3)];
        const durability = Math.floor(Math.random() * 6) + 15;
        resources.push({
            x: Math.random() * WORLD_WIDTH,
            y: Math.random() * WORLD_HEIGHT,
            size: 80 + durability * 8,
            type: type,
            durability: durability,
            initialDurability: durability,
            glow: Math.random()
        });
    }
};

// Gegner spawnen (zufällig an Weltgrenzen)
const spawnEnemy = () => {
    const types = [
        { size: 20, speed: 1.5, damage: 2, color: '#ff3333', tentacles: 4 },
        { size: 30, speed: 1, damage: 5, color: '#ff6600', tentacles: 6 }
    ];
    const type = types[Math.floor(Math.random() * 2)];
    const edge = Math.random() * (WORLD_WIDTH + WORLD_HEIGHT) * 2;
    let x, y;
    if (edge < WORLD_WIDTH) { x = edge; y = 0; }
    else if (edge < WORLD_WIDTH + WORLD_HEIGHT) { x = WORLD_WIDTH; y = edge - WORLD_WIDTH; }
    else if (edge < WORLD_WIDTH * 2 + WORLD_HEIGHT) { x = WORLD_WIDTH - (edge - (WORLD_WIDTH + WORLD_HEIGHT)); y = WORLD_HEIGHT; }
    else { x = 0; y = edge - (WORLD_WIDTH * 2 + WORLD_HEIGHT); }
    enemies.push({ x, y, ...type, glow: 0 });
};

// Partikel spawnen (z. B. für Effekte)
const spawnParticle = (x, y, color, size, speedX, speedY, life) => {
    particles.push({ x, y, color, size, speedX, speedY, life });
};

// Projektil spawnen (Schüsse von Spieler oder Türmen)
const spawnProjectile = (x, y, angle, source = 'player') => {
    const speed = source === 'player' ? 10 + player.weaponLevel * 2 : 8;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;
    projectiles.push({ x, y, dx, dy, size: 5, life: 60, source, angle });
    for (let i = 0; i < 5; i++) {
        spawnParticle(x, y, '#00ccff', 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 10);
    }
};

// Hintergrund zeichnen (Gradient + Krater)
const drawBackground = () => {
    const gradient = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 100, canvas.width / 2, canvas.height / 2, canvas.width);
    gradient.addColorStop(0, isNight ? '#1a0933' : '#3b1a66');
    gradient.addColorStop(1, isNight ? '#0d051a' : '#2b1354');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 50; i++) {
        const x = (Math.random() - camera.x / 100) % canvas.width;
        const y = (Math.random() - camera.y / 100) % canvas.height;
        const craterGradient = ctx.createRadialGradient(x, y, 0, x, y, 15);
        craterGradient.addColorStop(0, 'rgba(80, 60, 100, 0.8)');
        craterGradient.addColorStop(1, 'rgba(50, 40, 70, 0.2)');
        ctx.fillStyle = craterGradient;
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 15 + 5, 0, Math.PI * 2);
        ctx.fill();
    }
};

// Spieler zeichnen (mit Jetpack-Effekt)
const drawPlayer = () => {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(player.angle + Math.PI / 2);

    const bodyGradient = ctx.createLinearGradient(0, -20, 0, 20);
    bodyGradient.addColorStop(0, '#e6e6e6');
    bodyGradient.addColorStop(1, '#b3b3b3');
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(200, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(0, -15, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#666';
    ctx.fillRect(-10, 5, 20, 15);
    if (keys['w'] || keys['s'] || keys['a'] || keys['d']) {
        player.jetpackFrame = (player.jetpackFrame + 0.2) % 2;
        const flameGradient = ctx.createLinearGradient(0, 20, 0, 30);
        flameGradient.addColorStop(0, player.jetpackFrame > 1 ? '#ff6600' : '#ffcc00');
        flameGradient.addColorStop(1, '#ff3300');
        ctx.fillStyle = flameGradient;
        ctx.beginPath();
        ctx.moveTo(-5, 20);
        ctx.lineTo(5, 20);
        ctx.lineTo(0, 30 + Math.sin(gameTime * 5) * 5);
        ctx.fill();
        for (let i = 0; i < 3; i++) {
            spawnParticle(canvas.width / 2, canvas.height / 2 + 25, '#ff6600', 5, (Math.random() - 0.5) * 3, 2 + Math.random(), 20);
        }
    }

    ctx.restore();
};

// Rakete zeichnen (abhängig vom Fortschritt)
const drawRocket = () => {
    const rocketScreenX = rocket.x - camera.x;
    const rocketScreenY = rocket.y - camera.y;
    if (rocketScreenX > -100 && rocketScreenX < canvas.width && rocketScreenY > -100 && rocketScreenY < canvas.height) {
        ctx.beginPath();
        ctx.arc(rocketScreenX + 30, rocketScreenY + 50, rocket.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.translate(rocketScreenX + 30, rocketScreenY + 50);
        const rocketGradient = ctx.createLinearGradient(0, -60, 0, 60);
        rocketGradient.addColorStop(0, '#d9d9d9');
        rocketGradient.addColorStop(1, '#a6a6a6');
        ctx.fillStyle = rocketGradient;
        ctx.beginPath();
        ctx.moveTo(-20, 40);

        if (rocket.progress < 20) {
            ctx.lineTo(20, 40);
            ctx.lineTo(0, 20);
        } else if (rocket.progress < 40) {
            ctx.lineTo(20, 40);
            ctx.lineTo(15, 0);
            ctx.lineTo(-15, 0);
        } else if (rocket.progress < 60) {
            ctx.lineTo(20, 40);
            ctx.lineTo(15, -20);
            ctx.lineTo(-15, -20);
        } else if (rocket.progress < 80) {
            ctx.lineTo(20, 40);
            ctx.lineTo(15, -40);
            ctx.lineTo(-15, -40);
        } else {
            ctx.lineTo(20, 40);
            ctx.lineTo(15, -60);
            ctx.lineTo(-15, -60);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#00ccff';
        ctx.beginPath();
        ctx.arc(0, -20, 8, 0, Math.PI * 2);
        ctx.fill();

        if (rocket.progress > 20) {
            ctx.fillStyle = '#666';
            ctx.fillRect(-25, 40, 10, 15);
            ctx.fillRect(15, 40, 10, 15);
        }
        if (rocket.progress > 60) {
            ctx.fillStyle = '#ff6600';
            ctx.beginPath();
            ctx.moveTo(-15, 40);
            ctx.lineTo(15, 40);
            ctx.lineTo(0, 60);
            ctx.fill();
        }
        ctx.restore();

        ctx.fillStyle = '#333';
        ctx.fillRect(rocketScreenX + 10, rocketScreenY - 20, 40, 5);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(rocketScreenX + 10, rocketScreenY - 20, 40 * (rocket.progress / 100), 5);
    }
};

// Ressourcen zeichnen (Metall, Treibstoff, Energie)
const drawResources = (res) => {
    const screenX = res.x - camera.x;
    const screenY = res.y - camera.y;
    if (screenX > -res.size && screenX < canvas.width && screenY > -res.size && screenY < canvas.height) {
        res.glow = (res.glow + 0.05) % 1;
        ctx.save();
        ctx.translate(screenX, screenY);
        const scale = (res.durability / 20) * 2;
        ctx.scale(scale, scale);

        if (res.type === 'metal') {
            const metalGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 25);
            metalGradient.addColorStop(0, `rgba(200, 200, 200, ${0.8 + res.glow * 0.2})`);
            metalGradient.addColorStop(1, '#666');
            ctx.fillStyle = metalGradient;
            ctx.beginPath();
            ctx.moveTo(0, -25);
            ctx.lineTo(20, -5);
            ctx.lineTo(15, 20);
            ctx.lineTo(-10, 25);
            ctx.lineTo(-20, 0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (res.type === 'fuel') {
            const fuelGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 25);
            fuelGradient.addColorStop(0, `rgba(255, 204, 0, ${0.8 + res.glow * 0.2})`);
            fuelGradient.addColorStop(1, '#cc6600');
            ctx.fillStyle = fuelGradient;
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            const energyGradient = ctx.createLinearGradient(0, -25, 0, 25);
            energyGradient.addColorStop(0, `rgba(0, 255, 255, ${0.8 + res.glow * 0.2})`);
            energyGradient.addColorStop(1, '#0066cc');
            ctx.fillStyle = energyGradient;
            ctx.beginPath();
            ctx.moveTo(0, -25);
            ctx.lineTo(15, -5);
            ctx.lineTo(10, 20);
            ctx.lineTo(-10, 20);
            ctx.lineTo(-15, -5);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#00ccff';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.restore();
        ctx.fillStyle = '#fff';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(res.durability, screenX, screenY + 5);
    }
};

// Gegner zeichnen (mit Tentakel-Animation)
const drawEnemies = (enemy) => {
    const screenX = enemy.x - camera.x;
    const screenY = enemy.y - camera.y;
    if (screenX > -enemy.size && screenX < canvas.width && screenY > -enemy.size && screenY < canvas.height) {
        enemy.glow = (enemy.glow + 0.03) % 1;
        ctx.save();
        ctx.translate(screenX, screenY);
        const pulse = 1 + Math.sin(gameTime * 5) * 0.1;
        ctx.scale(pulse, pulse);
        const enemyGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, enemy.size / 2);
        enemyGradient.addColorStop0, enemy.color;
        enemyGradient.addColorStop(1, '#660000');
        ctx.fillStyle = enemyGradient;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.size / 2, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < enemy.tentacles; i++) {
            const angle = (i / enemy.tentacles) * Math.PI * 2 + Math.sin(gameTime * 2);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(
                Math.cos(angle) * 10, Math.sin(angle) * 10,
                Math.cos(angle) * 20, Math.sin(angle) * 20
            );
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + enemy.glow * 0.5})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore();
    }
};

// Türme zeichnen (mit Schusslogik)
const drawTowers = () => {
    towers.forEach(tower => {
        const screenX = tower.x - camera.x;
        const screenY = tower.y - camera.y;
        if (screenX > -50 && screenX < canvas.width && screenY > -50 && screenY < canvas.height) {
            ctx.save();
            ctx.translate(screenX, screenY);
            const towerGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 25);
            towerGradient.addColorStop(0, '#ccc');
            towerGradient.addColorStop(1, '#666');
            ctx.fillStyle = towerGradient;
            ctx.beginPath();
            ctx.arc(0, 0, 25, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#00ccff';
            ctx.beginPath();
            ctx.arc(0, -10, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#333';
            ctx.fillRect(-5, 15, 10, 10);
            ctx.restore();

            if (tower.cooldown > 0) tower.cooldown--;
            else {
                enemies.forEach(enemy => {
                    const dist = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
                    if (dist < 200) {
                        const angle = Math.atan2(enemy.y - tower.y, enemy.x - tower.x);
                        spawnProjectile(tower.x, tower.y, angle, 'tower');
                        tower.cooldown = 60;
                    }
                });
            }
        }
    });
};

// Projektile zeichnen
const drawProjectiles = () => {
    projectiles.forEach((proj, i) => {
        ctx.save();
        ctx.translate(proj.x - camera.x, proj.y - camera.y);
        ctx.rotate(proj.angle);
        const gradient = ctx.createLinearGradient(-15, 0, 15, 0);
        gradient.addColorStop(0, 'rgba(0, 255, 255, 0)');
        gradient.addColorStop(0.3, '#00ffff');
        gradient.addColorStop(0.7, '#00ccff');
        gradient.addColorStop(1, 'rgba(0, 204, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(-15, -3);
        ctx.lineTo(15, 0);
        ctx.lineTo(-15, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        spawnParticle(proj.x, proj.y, '#00ccff', 2, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 1, 5);
        proj.x += proj.dx;
        proj.y += proj.dy;
        proj.life--;
        if (proj.life <= 0) projectiles.splice(i, 1);
    });
};

// Partikel zeichnen
const drawParticles = () => {
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x - camera.x, p.y - camera.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        p.x += p.speedX;
        p.y += p.speedY;
        p.life--;
        p.size *= 0.95;
    });
};

// Alles zeichnen (Haupt-Render-Funktion)
const draw = () => {
    camera.x = player.x - canvas.width / 2;
    camera.y = player.y - canvas.height / 2;
    camera.x = Math.max(0, Math.min(camera.x, WORLD_WIDTH - canvas.width));
    camera.y = Math.max(0, Math.min(camera.y, WORLD_HEIGHT - canvas.height));

    drawBackground();
    resources.forEach(drawResources);
    enemies.forEach(drawEnemies);
    drawRocket();
    drawTowers();
    drawPlayer();
    drawProjectiles();
    drawParticles();

    // Minimap zeichnen
    mCtx.fillStyle = '#0d0d0d';
    mCtx.fillRect(0, 0, minimap.width, minimap.height);
    mCtx.fillStyle = '#6f42c1';
    mCtx.fillRect(player.x * minimap.width / WORLD_WIDTH, player.y * minimap.height / WORLD_HEIGHT, 5, 5);
    resources.forEach(res => {
        mCtx.fillStyle = res.type === 'metal' ? '#999' : res.type === 'fuel' ? '#ffcc00' : '#00ccff';
        mCtx.fillRect(res.x * minimap.width / WORLD_WIDTH, res.y * minimap.height / WORLD_HEIGHT, 3, 3);
    });
    enemies.forEach(enemy => {
        mCtx.fillStyle = enemy.color;
        mCtx.fillRect(enemy.x * minimap.width / WORLD_WIDTH, enemy.y * minimap.height / WORLD_HEIGHT, 4, 4);
    });
    towers.forEach(tower => {
        mCtx.fillStyle = '#999';
        mCtx.fillRect(tower.x * minimap.width / WORLD_WIDTH, tower.y * minimap.height / WORLD_HEIGHT, 4, 4);
    });
    mCtx.fillStyle = '#fff';
    mCtx.fillRect(rocket.x * minimap.width / WORLD_WIDTH, rocket.y * minimap.height / WORLD_HEIGHT, 5, 5);
};

// Eingabe-Handling
const keys = {};
document.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
document.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
document.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - canvas.width / 2;
    const mouseY = e.clientY - rect.top - canvas.height / 2;
    player.angle = Math.atan2(mouseY, mouseX);
});

// Mausklick (Ressourcen abbauen + Schießen)
document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && gameRunning) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left + camera.x;
        const clickY = e.clientY - rect.top + camera.y;
        
        resources.forEach((res, index) => {
            const distToResource = Math.hypot(clickX - res.x, clickY - res.y);
            const distToPlayer = Math.hypot(player.x - res.x, player.y - res.y);
            if (distToResource < res.size && distToPlayer < 100) {
                res.durability -= 1;
                spawnParticle(res.x, res.y, res.type === 'metal' ? '#999' : res.type === 'fuel' ? '#ffcc00' : '#00ccff', 5, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 15);
                
                if (res.durability <= 0) {
                    const amount = res.initialDurability;
                    if (res.type === 'metal') player.metal += amount;
                    if (res.type === 'fuel') player.fuel += amount;
                    if (res.type === 'energy') player.energy += amount;
                    resources.splice(index, 1);
                    for (let j = 0; j < 10; j++) {
                        spawnParticle(res.x, res.y, res.type === 'metal' ? '#999' : res.type === 'fuel' ? '#ffcc00' : '#00ccff', 5, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 20);
                    }
                }
            }
        });
        
        spawnProjectile(player.x, player.y, player.angle);
    }
});

// Touch-Steuerung für Mobile
const upBtn = document.getElementById('upBtn');
const leftBtn = document.getElementById('leftBtn');
const downBtn = document.getElementById('downBtn');
const rightBtn = document.getElementById('rightBtn');

upBtn.addEventListener('touchstart', () => { keys['w'] = true; });
upBtn.addEventListener('touchend', () => { keys['w'] = false; });
leftBtn.addEventListener('touchstart', () => { keys['a'] = true; });
leftBtn.addEventListener('touchend', () => { keys['a'] = false; });
downBtn.addEventListener('touchstart', () => { keys['s'] = true; });
downBtn.addEventListener('touchend', () => { keys['s'] = false; });
rightBtn.addEventListener('touchstart', () => { keys['d'] = true; });
rightBtn.addEventListener('touchend', () => { keys['d'] = false; });

// Spielerbewegung
const movePlayer = () => {
    if (keys['w'] && player.y > player.size) player.y -= player.speed;
    if (keys['s'] && player.y < WORLD_HEIGHT - player.size) player.y += player.speed;
    if (keys['a'] && player.x > player.size) player.x -= player.speed;
    if (keys['d'] && player.x < WORLD_WIDTH - player.size) player.x += player.speed;
};

// Kollisionen prüfen
const checkCollisions = () => {
    projectiles.forEach((proj, pIdx) => {
        enemies.forEach((enemy, eIdx) => {
            const dist = Math.hypot(proj.x - enemy.x, proj.y - enemy.y);
            if (dist < proj.size + enemy.size / 2) {
                enemy.size -= 5 * (proj.source === 'player' ? player.weaponLevel : 1);
                projectiles.splice(pIdx, 1);
                if (enemy.size <= 0) {
                    enemies.splice(eIdx, 1);
                    for (let j = 0; j < 10; j++) {
                        spawnParticle(enemy.x, enemy.y, enemy.color, 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 20);
                    }
                }
            }
        });
    });

    enemies.forEach((enemy, i) => {
        const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (dist < player.size + enemy.size) {
            player.health -= enemy.damage / player.weaponLevel;
            enemies.splice(i, 1);
            for (let j = 0; j < 10; j++) {
                spawnParticle(enemy.x, enemy.y, enemy.color, 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 20);
            }
        } else {
            enemy.x += (player.x - enemy.x) / dist * enemy.speed;
            enemy.y += (player.y - enemy.y) / dist * enemy.speed;
        }
    });

    const distToRocket = Math.hypot(player.x - rocket.x, player.y - rocket.y);
    if (distToRocket < rocket.radius && player.oxygen < 100) {
        player.oxygen = Math.min(100, player.oxygen + 0.5);
    }
};

// Menü-Elemente
const mainMenu = document.getElementById('mainMenu');
const gameContainer = document.getElementById('gameContainer');
const startGameBtn = document.getElementById('startGame');
const showInstructionsBtn = document.getElementById('showInstructions');
const closeInstructionsBtn = document.getElementById('closeInstructions');
const instructionsCard = document.getElementById('instructionsCard');

// Spiel zurücksetzen
const resetGame = () => {
    player = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, size: 30, speed: 3, health: 100, oxygen: 100, metal: 0, fuel: 0, energy: 0, weaponLevel: 1, angle: 0, jetpackFrame: 0 };
    rocket = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, progress: 0, radius: 100, upgradeLevel: 0, stage: 0 };
    enemies = [];
    resources = [];
    particles = [];
    projectiles = [];
    towers = [];
    isNight = false;
    nightCount = 0;
    gameTime = 0;
    gameRunning = false;
    document.getElementById('message').textContent = '';
};

// Spiel starten
startGameBtn.addEventListener('click', () => {
    resetGame();
    mainMenu.classList.add('d-none');
    gameContainer.classList.remove('d-none');
    spawnInitialResources();
    gameRunning = true;
    gameLoop();
});

showInstructionsBtn.addEventListener('click', () => {
    instructionsCard.classList.remove('d-none');
});

closeInstructionsBtn.addEventListener('click', () => {
    instructionsCard.classList.add('d-none');
});

// Raketenstart-Animation
const rocketLaunchAnimation = (callback) => {
    let launchTime = 0;
    const launchDuration = 2000;
    player.x = rocket.x;
    player.y = rocket.y;

    const animateLaunch = () => {
        drawBackground();
        drawRocket();
        drawPlayer();
        drawParticles();

        rocket.y -= 5;
        player.y = rocket.y;

        for (let i = 0; i < 5; i++) {
            spawnParticle(
                rocket.x + 30,
                rocket.y + 90,
                '#ff6600',
                5,
                (Math.random() - 0.5) * 3,
                5,
                20
            );
        }

        launchTime += 16;
        if (launchTime < launchDuration) {
            requestAnimationFrame(animateLaunch);
        } else {
            callback();
        }
    };

    animateLaunch();
};

// Hauptspielschleife
const gameLoop = () => {
    if (!gameRunning) return;

    movePlayer();
    draw();
    checkCollisions();
    updateUI();

    gameTime += 0.016;
    player.oxygen -= isNight ? 0.03 : 0.01;
    if (isNight) {
        const spawnChance = nightCount < 3 ? 0.01 : 0.07;
        if (Math.random() < spawnChance) spawnEnemy();
    } else {
        enemies.forEach((enemy, i) => {
            enemy.size -= 0.5;
            if (enemy.size <= 0) {
                enemies.splice(i, 1);
                for (let j = 0; j < 10; j++) {
                    spawnParticle(enemy.x, enemy.y, enemy.color, 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 20);
                }
            }
        });
    }

    if (player.health <= 0 || player.oxygen <= 0) {
        document.getElementById('message').textContent = 'Game Over! Du bist gestorben.';
        gameRunning = false;
        setTimeout(() => {
            gameContainer.classList.add('d-none');
            mainMenu.classList.remove('d-none');
        }, 2000);
        return;
    }

    if (rocket.progress >= 100) {
        document.getElementById('message').textContent = 'Glückwunsch! Du bist entkommen!';
        gameRunning = false;
        rocketLaunchAnimation(() => {
            gameContainer.classList.add('d-none');
            mainMenu.classList.remove('d-none');
        });
        return;
    }

    requestAnimationFrame(gameLoop);
};

// Tag/Nacht-Zyklus
setInterval(() => {
    if (gameRunning) {
        isNight = !isNight;
        if (isNight) nightCount++;
        document.getElementById('message').textContent = isNight ? 'Nacht: Aliens greifen an!' : 'Tag: Sammle Ressourcen!';
        setTimeout(() => document.getElementById('message').textContent = '', 2000);
    }
}, 45000);

// Button-Interaktionen
document.getElementById('upgradeWeapon').addEventListener('click', () => {
    if (player.metal >= 40 && player.energy >= 20) {
        player.metal -= 40;
        player.energy -= 20;
        player.weaponLevel += 1;
    }
});

document.getElementById('craftOxygen').addEventListener('click', () => {
    if (player.energy >= 10 && player.oxygen < 100) {
        player.energy -= 10;
        player.oxygen = Math.min(100, player.oxygen + 20);
    }
});

document.getElementById('repairRocket').addEventListener('click', () => {
    const metalCost = 50 + rocket.upgradeLevel * 40;
    const fuelCost = 40 + rocket.upgradeLevel * 30;
    const energyCost = 30 + rocket.upgradeLevel * 20;
    if (player.metal >= metalCost && player.fuel >= fuelCost && player.energy >= energyCost && rocket.progress < 100 &&
        Math.hypot(player.x - rocket.x, player.y - rocket.y) < rocket.radius) {
        player.metal -= metalCost;
        player.fuel -= fuelCost;
        player.energy -= energyCost;
        rocket.progress += 20;
        rocket.upgradeLevel++;
        for (let i = 0; i < 10; i++) {
            spawnParticle(rocket.x, rocket.y + 50, '#ff6600', 5, (Math.random() - 0.5) * 3, -2, 20);
        }
    }
});

document.getElementById('upgradeOxygen').addEventListener('click', () => {
    if (player.metal >= 60 && player.energy >= 30) {
        player.metal -= 60;
        player.energy -= 30;
        rocket.radius += 20;
    }
});

document.getElementById('placeTower').addEventListener('click', () => {
    if (player.metal >= 100 && player.energy >= 40) {
        player.metal -= 100;
        player.energy -= 40;
        towers.push({ x: player.x, y: player.y, cooldown: 0 });
    }
});

// Fenstergröße anpassen
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    minimap.width = window.innerWidth > 768 ? 200 : window.innerWidth > 576 ? 150 : 100;
    minimap.height = window.innerWidth > 768 ? 150 : window.innerWidth > 576 ? 100 : 75;
});