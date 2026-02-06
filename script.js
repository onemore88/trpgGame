const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const stageEl = document.getElementById("stage");
const phaseEl = document.getElementById("phase");
const timerEl = document.getElementById("timer");
const goldEl = document.getElementById("gold");
const aliveEl = document.getElementById("alive");
const statusEl = document.getElementById("status");

const drawButton = document.getElementById("draw");
const upgradeButton = document.getElementById("upgrade");

const infoTier = document.getElementById("info-tier");
const infoDamage = document.getElementById("info-damage");
const infoSpeed = document.getElementById("info-speed");
const infoRange = document.getElementById("info-range");
const infoLevel = document.getElementById("info-level");

const config = {
  width: 800,
  height: 800,
  trackThickness: 60,
  prepTime: 60,
  fightTime: 60,
  maxAlive: 100,
  drawCost: 10,
  killReward: 5,
  stageMax: 100,
};

const tierProbabilities = [
  { tier: 1, chance: 0.3 },
  { tier: 2, chance: 0.2 },
  { tier: 3, chance: 0.15 },
  { tier: 4, chance: 0.1 },
  { tier: 5, chance: 0.08 },
  { tier: 6, chance: 0.06 },
  { tier: 7, chance: 0.04 },
  { tier: 8, chance: 0.03 },
  { tier: 9, chance: 0.02 },
  { tier: 10, chance: 0.02 },
];

const tierStats = {
  1: { damage: 2, speed: 1.0, range: 110 },
  2: { damage: 3, speed: 1.1, range: 120 },
  3: { damage: 4, speed: 1.2, range: 130 },
  4: { damage: 5, speed: 1.25, range: 140 },
  5: { damage: 6, speed: 1.35, range: 150 },
  6: { damage: 8, speed: 1.45, range: 160 },
  7: { damage: 10, speed: 1.55, range: 170 },
  8: { damage: 13, speed: 1.65, range: 180 },
  9: { damage: 16, speed: 1.75, range: 190 },
  10: { damage: 20, speed: 1.9, range: 210 },
};

const tierMultiplier = {
  1: 1.0,
  2: 1.05,
  3: 1.1,
  4: 1.15,
  5: 1.2,
  6: 1.25,
  7: 1.3,
  8: 1.35,
  9: 1.4,
  10: 1.5,
};

const state = {
  stage: 1,
  phase: "Prep",
  phaseTimer: config.prepTime,
  gold: 100,
  enemies: [],
  towers: [],
  selectedTower: null,
  draggingTower: null,
  isPlacingNew: false,
  fightElapsed: 0,
  nextSpawnTime: 0,
  bossSpawned: false,
  gameOver: false,
  victory: false,
};

const path = (() => {
  const offset = config.trackThickness / 2;
  const lengthX = config.width - offset * 2;
  const lengthY = config.height - offset * 2;
  return {
    offset,
    lengthX,
    lengthY,
    perimeter: lengthX * 2 + lengthY * 2,
  };
})();

function randomTier() {
  const roll = Math.random();
  let cumulative = 0;
  for (const entry of tierProbabilities) {
    cumulative += entry.chance;
    if (roll <= cumulative) {
      return entry.tier;
    }
  }
  return 1;
}

function getInnerBounds() {
  const start = config.trackThickness;
  const end = config.width - config.trackThickness;
  return { start, end };
}

function isInsideInner(x, y) {
  const { start, end } = getInnerBounds();
  return x > start && x < end && y > start && y < end;
}

function clampToInner(x, y) {
  const { start, end } = getInnerBounds();
  return {
    x: Math.min(Math.max(x, start + 10), end - 10),
    y: Math.min(Math.max(y, start + 10), end - 10),
  };
}

function makeEnemy(stage, isBoss = false) {
  const baseHp = 12 + stage * 3;
  const baseSpeed = 80 + stage * 0.5;
  const hp = isBoss ? baseHp * 40 : baseHp;
  const speed = isBoss ? baseSpeed * 0.7 : baseSpeed;
  const size = isBoss ? 32 : 16;
  return {
    hp,
    maxHp: hp,
    speed,
    size,
    progress: 0,
    isBoss,
  };
}

function enemyPosition(progress) {
  const { offset, lengthX, lengthY, perimeter } = path;
  let p = progress % perimeter;
  if (p < lengthX) {
    return { x: config.width - offset - p, y: offset };
  }
  p -= lengthX;
  if (p < lengthY) {
    return { x: offset, y: offset + p };
  }
  p -= lengthY;
  if (p < lengthX) {
    return { x: offset + p, y: config.height - offset };
  }
  p -= lengthX;
  return { x: config.width - offset, y: config.height - offset - p };
}

function makeTower(x, y, tier) {
  const stats = tierStats[tier];
  return {
    x,
    y,
    tier,
    level: 0,
    range: stats.range,
    baseDamage: stats.damage,
    attackSpeed: stats.speed,
    cooldown: 0,
  };
}

function towerDamage(tower) {
  return (
    tower.baseDamage + tower.level * (1 * tierMultiplier[tower.tier])
  );
}

function upgradeCost(tower) {
  return 10 + tower.level * 5 + tower.tier * 2;
}

function updateHud() {
  stageEl.textContent = state.stage;
  phaseEl.textContent = state.phase;
  timerEl.textContent = Math.ceil(state.phaseTimer);
  goldEl.textContent = state.gold;
  aliveEl.textContent = state.enemies.length;
  if (state.gameOver) {
    statusEl.textContent = "Game Over: 적이 100마리에 도달!";
  } else if (state.victory) {
    statusEl.textContent = "Victory! 100 스테이지 클리어!";
  } else {
    statusEl.textContent = "";
  }

  if (!state.selectedTower) {
    infoTier.textContent = "-";
    infoDamage.textContent = "-";
    infoSpeed.textContent = "-";
    infoRange.textContent = "-";
    infoLevel.textContent = "-";
    upgradeButton.disabled = true;
    upgradeButton.textContent = "강화 (0G)";
    return;
  }

  const tower = state.selectedTower;
  infoTier.textContent = `T${tower.tier}`;
  infoDamage.textContent = towerDamage(tower).toFixed(1);
  infoSpeed.textContent = tower.attackSpeed.toFixed(2);
  infoRange.textContent = tower.range;
  infoLevel.textContent = tower.level;
  const cost = upgradeCost(tower);
  upgradeButton.textContent = `강화 (${cost}G)`;
  upgradeButton.disabled = state.gold < cost || state.gameOver || state.victory;
}

function drawBoard() {
  ctx.clearRect(0, 0, config.width, config.height);
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, config.width, config.height);

  ctx.fillStyle = "#0f172a";
  const innerSize = config.width - config.trackThickness * 2;
  ctx.fillRect(
    config.trackThickness,
    config.trackThickness,
    innerSize,
    innerSize
  );

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    config.trackThickness,
    config.trackThickness,
    innerSize,
    innerSize
  );

  ctx.strokeStyle = "rgba(14, 165, 233, 0.45)";
  ctx.lineWidth = 1;
  ctx.strokeRect(path.offset, path.offset, path.lengthX, path.lengthY);

  for (const tower of state.towers) {
    const isSelected = tower === state.selectedTower;
    ctx.beginPath();
    ctx.fillStyle = isSelected ? "#38bdf8" : "#f59e0b";
    ctx.arc(tower.x, tower.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`T${tower.tier}`, tower.x, tower.y + 4);
  }

  if (state.selectedTower) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
    ctx.lineWidth = 2;
    ctx.arc(
      state.selectedTower.x,
      state.selectedTower.y,
      state.selectedTower.range,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  for (const enemy of state.enemies) {
    const pos = enemyPosition(enemy.progress);
    ctx.beginPath();
    ctx.fillStyle = enemy.isBoss ? "#ef4444" : "#22c55e";
    ctx.arc(pos.x, pos.y, enemy.size / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
    ctx.fillRect(pos.x - 16, pos.y - enemy.size, 32, 4);
    ctx.fillStyle = enemy.isBoss ? "#fca5a5" : "#bbf7d0";
    ctx.fillRect(
      pos.x - 16,
      pos.y - enemy.size,
      (enemy.hp / enemy.maxHp) * 32,
      4
    );
  }

  if (state.draggingTower) {
    const tower = state.draggingTower;
    const valid = isInsideInner(tower.x, tower.y);
    ctx.beginPath();
    ctx.strokeStyle = valid ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)";
    ctx.lineWidth = 2;
    ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function spawnEnemy() {
  state.enemies.push(makeEnemy(state.stage, false));
}

function spawnBoss() {
  state.enemies.push(makeEnemy(state.stage, true));
}

function updatePhase(dt) {
  if (state.gameOver || state.victory) {
    return;
  }
  state.phaseTimer -= dt;
  if (state.phaseTimer <= 0) {
    if (state.phase === "Prep") {
      state.phase = "Fight";
      state.phaseTimer = config.fightTime;
      state.fightElapsed = 0;
      state.nextSpawnTime = 0;
      state.bossSpawned = false;
    } else {
      if (state.stage >= config.stageMax) {
        state.victory = true;
      } else {
        state.stage += 1;
        state.phase = "Prep";
        state.phaseTimer = config.prepTime;
      }
    }
  }
}

function updateSpawns(dt) {
  if (state.phase !== "Fight" || state.gameOver || state.victory) {
    return;
  }
  state.fightElapsed += dt;
  if (state.fightElapsed <= 30) {
    while (state.nextSpawnTime <= state.fightElapsed && state.nextSpawnTime < 30) {
      spawnEnemy();
      state.nextSpawnTime += 1;
    }
  }

  if (
    state.stage % 10 === 0 &&
    !state.bossSpawned &&
    state.fightElapsed >= 5
  ) {
    spawnBoss();
    state.bossSpawned = true;
  }
}

function updateEnemies(dt) {
  const speedFactor = dt;
  for (const enemy of state.enemies) {
    enemy.progress += enemy.speed * speedFactor;
  }
}

function updateTowers(dt) {
  for (const tower of state.towers) {
    tower.cooldown -= dt;
    if (tower.cooldown > 0) {
      continue;
    }
    let target = null;
    let closestDist = Infinity;
    for (const enemy of state.enemies) {
      const pos = enemyPosition(enemy.progress);
      const dx = tower.x - pos.x;
      const dy = tower.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= tower.range && dist < closestDist) {
        closestDist = dist;
        target = enemy;
      }
    }
    if (target) {
      target.hp -= towerDamage(tower);
      tower.cooldown = 1 / tower.attackSpeed;
    }
  }

  const survivors = [];
  for (const enemy of state.enemies) {
    if (enemy.hp > 0) {
      survivors.push(enemy);
    } else {
      state.gold += config.killReward;
    }
  }
  state.enemies = survivors;
}

function checkGameOver() {
  if (state.enemies.length >= config.maxAlive) {
    state.gameOver = true;
  }
}

function gameLoop(timestamp) {
  if (!state.lastTime) {
    state.lastTime = timestamp;
  }
  const dt = Math.min((timestamp - state.lastTime) / 1000, 0.05);
  state.lastTime = timestamp;

  updatePhase(dt);
  updateSpawns(dt);
  updateEnemies(dt);
  updateTowers(dt);
  checkGameOver();
  updateHud();
  drawBoard();
  requestAnimationFrame(gameLoop);
}

function setSelectedTower(tower) {
  state.selectedTower = tower;
  updateHud();
}

function towerAtPosition(x, y) {
  return state.towers.find(
    (tower) => Math.hypot(tower.x - x, tower.y - y) <= 14
  );
}

canvas.addEventListener("mousedown", (event) => {
  if (state.gameOver || state.victory) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const tower = towerAtPosition(x, y);
  if (tower) {
    state.draggingTower = tower;
    setSelectedTower(tower);
  }
});

canvas.addEventListener("mousemove", (event) => {
  if (!state.draggingTower) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  state.draggingTower.x = x;
  state.draggingTower.y = y;
});

canvas.addEventListener("mouseup", () => {
  if (!state.draggingTower) {
    return;
  }
  if (!isInsideInner(state.draggingTower.x, state.draggingTower.y)) {
    if (state.isPlacingNew) {
      state.towers = state.towers.filter((t) => t !== state.draggingTower);
      state.gold += config.drawCost;
    } else {
      const { x, y } = clampToInner(
        state.draggingTower.x,
        state.draggingTower.y
      );
      state.draggingTower.x = x;
      state.draggingTower.y = y;
    }
  }
  state.draggingTower = null;
  state.isPlacingNew = false;
});

canvas.addEventListener("mouseleave", () => {
  if (state.draggingTower && !state.isPlacingNew) {
    const { x, y } = clampToInner(state.draggingTower.x, state.draggingTower.y);
    state.draggingTower.x = x;
    state.draggingTower.y = y;
  }
  state.draggingTower = null;
  state.isPlacingNew = false;
});

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const tower = towerAtPosition(x, y);
  if (tower) {
    setSelectedTower(tower);
  }
});

drawButton.addEventListener("click", () => {
  if (state.gameOver || state.victory) {
    return;
  }
  if (state.gold < config.drawCost) {
    return;
  }
  state.gold -= config.drawCost;
  const tier = randomTier();
  const { start, end } = getInnerBounds();
  const tower = makeTower((start + end) / 2, (start + end) / 2, tier);
  state.towers.push(tower);
  state.draggingTower = tower;
  state.isPlacingNew = true;
  setSelectedTower(tower);
});

upgradeButton.addEventListener("click", () => {
  if (!state.selectedTower) {
    return;
  }
  const cost = upgradeCost(state.selectedTower);
  if (state.gold < cost) {
    return;
  }
  state.gold -= cost;
  state.selectedTower.level += 1;
  updateHud();
});

updateHud();
requestAnimationFrame(gameLoop);
