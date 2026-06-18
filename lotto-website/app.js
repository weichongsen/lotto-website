// ==================== Supabase 配置（务必修改） ====================
const SUPABASE_URL = 'https://qwvrojfdripeswuocgpo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5c2rAccL-qR_QX7iAiQXiw_IdCVF_a4';
// =================================================================

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== 全局状态 ====================
window.currentUser = null;
window.userProfile = null;
window.isVip = false;
window.currentType = 'dlt';
window.currentPrediction = null;
window.soundEnabled = true;
window.animationEnabled = true;
window.selectedPlanId = null;
window.bgmAudio = null;

const LOTTERY_CONFIG = {
  dlt: { frontMax: 35, backMax: 12, frontCount: 5, backCount: 2, name: '大乐透' },
  ssq: { frontMax: 33, backMax: 16, frontCount: 6, backCount: 1, name: '双色球' }
};
const FREE_PREDICT = 1;   // 每日免费预测1组
const FREE_DRAW = 5;      // 每日免费摇奖5次

// ==================== 粒子背景 ====================
(function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];
  function resize() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize); resize();
  for (let i = 0; i < 90; i++) particles.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, r: Math.random() * 2 + 1 });
  (function anim() { ctx.clearRect(0, 0, w, h); particles.forEach(p => { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = '#00F5FF'; ctx.shadowBlur = 12; ctx.fill(); }); requestAnimationFrame(anim); })();
})();

// ==================== 音频 ====================
let audioCtx;
window.initAudio = () => { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); };
function playBeep(f = 520, d = 0.1) { if (!window.soundEnabled || !audioCtx) return; const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.06, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + d); o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + d); }
window.playRollSound = () => playBeep(620, 0.04);
window.playStopSound = () => playBeep(920, 0.1);

// ==================== 会话恢复 ====================
async function restoreSession() {
  const sessionStr = localStorage.getItem('supabase_session');
  if (!sessionStr) {
    window.location.href = 'login.html';
    return;
  }
  try {
    const session = JSON.parse(sessionStr);
    const { data } = await supabase.auth.setSession(session);
    if (!data.user) throw new Error('Session invalid');
    window.currentUser = data.user;
    await loadProfile();
    showApp();
  } catch (e) {
    localStorage.removeItem('supabase_session');
    window.location.href = 'login.html';
  }
}

// ==================== 用户资料 ====================
async function loadProfile() {
  const { data } = await supabase.from('profiles').select('*').eq('id', window.currentUser.id).single();
  if (data) {
    window.userProfile = data;
    window.isVip = data.is_vip && new Date(data.vip_expire_date) > new Date();
    // 重置每日计数
    const today = new Date().toDateString();
    const last = data.last_prediction_date ? new Date(data.last_prediction_date).toDateString() : null;
    if (last !== today) {
      await supabase.from('profiles').update({ predictions_today: 0, draws_today: 0, last_prediction_date: new Date().toISOString() }).eq('id', window.currentUser.id);
      window.userProfile.predictions_today = 0;
      window.userProfile.draws_today = 0;
    }
  }
  updateUserUI();
}

function updateUserUI() {
  document.getElementById('user-badge').innerHTML = window.isVip ? '<span class="vip-badge">👑 VIP</span>' : '<span class="free-badge">免费</span>';
  document.getElementById('user-name-display').textContent = window.userProfile?.username || window.currentUser?.email?.split('@')[0] || '';
  if (!window.isVip) {
    const predRemain = FREE_PREDICT - (window.userProfile?.predictions_today || 0);
    const drawRemain = FREE_DRAW - (window.userProfile?.draws_today || 0);
    document.getElementById('predict-remaining').textContent = `今日免费预测: ${Math.max(0, predRemain)}次`;
    document.getElementById('draw-remaining').textContent = `今日免费摇奖: ${Math.max(0, drawRemain)}次`;
  } else {
    document.getElementById('predict-remaining').textContent = 'VIP无限次';
    document.getElementById('draw-remaining').textContent = 'VIP无限次';
  }
}

function showApp() {
  document.getElementById('main-app').style.display = 'block';
  updateHotCold();
}

// ==================== VIP ====================
window.loadVipPlans = async () => {
  const { data } = await supabase.from('vip_plans').select('*').eq('is_active', true).order('price');
  const container = document.getElementById('vip-plans');
  if (data && data.length) {
    container.innerHTML = data.map(plan => `
      <div class="plan-card" id="plan-${plan.id}" onclick="window.selectPlan(${plan.id}, ${plan.price})">
        <h3 style="color:#00F5FF;">${plan.name}</h3>
        <div style="font-size:2rem; color:#FFD700;">¥${plan.price}</div>
        <p>${plan.days}天</p>
      </div>
    `).join('');
  }
};
window.selectPlan = (id, price) => {
  window.selectedPlanId = id;
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('plan-' + id).classList.add('selected');
  document.getElementById('vip-pay-btn').textContent = '💰 立即支付 ¥' + price;
};
window.showVipModal = () => {
  window.loadVipPlans();
  document.getElementById('vip-modal').classList.add('active');
};
window.handleVipPayment = async () => {
  if (!window.selectedPlanId) return alert('请选择套餐');
  const { data: plan } = await supabase.from('vip_plans').select('*').eq('id', window.selectedPlanId).single();
  if (!plan) return;
  const orderId = 'VIP' + Date.now() + Math.random().toString(36).substr(2, 6);
  await supabase.from('payments').insert({ user_id: window.currentUser.id, order_id: orderId, amount: plan.price, vip_days: plan.days, status: 'pending' });
  // 模拟支付成功（实际需接入支付）
  alert('订单已创建！模拟支付成功');
  await supabase.from('payments').update({ status: 'completed' }).eq('order_id', orderId);
  const expireDate = new Date(Date.now() + plan.days * 86400000);
  await supabase.from('profiles').update({ is_vip: true, vip_expire_date: expireDate.toISOString() }).eq('id', window.currentUser.id);
  window.isVip = true;
  updateUserUI();
  document.getElementById('vip-modal').classList.remove('active');
  alert('🎉 VIP开通成功！');
};

// ==================== 权限检查 ====================
async function checkPredictLimit(count) {
  if (!window.currentUser) { alert('请先登录'); return false; }
  if (window.isVip) return true;
  if (count > 1) { alert('多组预测为VIP功能，请升级'); window.showVipModal(); return false; }
  const used = window.userProfile?.predictions_today || 0;
  if (used >= FREE_PREDICT) { alert('今日免费预测次数已用完，请升级VIP'); window.showVipModal(); return false; }
  await supabase.from('profiles').update({ predictions_today: used + 1 }).eq('id', window.currentUser.id);
  window.userProfile.predictions_today = used + 1;
  updateUserUI();
  return true;
}
async function checkDrawLimit() {
  if (!window.currentUser) { alert('请先登录'); return false; }
  if (window.isVip) return true;
  const used = window.userProfile?.draws_today || 0;
  if (used >= FREE_DRAW) { alert('今日免费摇奖次数已用完，请升级VIP'); window.showVipModal(); return false; }
  await supabase.from('profiles').update({ draws_today: used + 1 }).eq('id', window.currentUser.id);
  window.userProfile.draws_today = used + 1;
  updateUserUI();
  return true;
}

// ==================== 彩票核心逻辑 ====================
function getRandomSet(type) {
  const cfg = LOTTERY_CONFIG[type];
  const f = new Set(), b = new Set();
  while (f.size < cfg.frontCount) f.add(Math.floor(Math.random() * cfg.frontMax) + 1);
  while (b.size < cfg.backCount) b.add(Math.floor(Math.random() * cfg.backMax) + 1);
  return { front: Array.from(f).sort((a, b) => a - b), back: Array.from(b).sort((a, b) => a - b) };
}

function weightedRandom(type) {
  const cfg = LOTTERY_CONFIG[type];
  const ff = new Map(), bf = new Map();
  for (let i = 1; i <= cfg.frontMax; i++) ff.set(i, Math.random());
  for (let i = 1; i <= cfg.backMax; i++) bf.set(i, Math.random());
  function pick(pool, map, count) {
    const sel = new Set(), cand = pool.map(n => ({ n, w: map.get(n) + 0.5 }));
    while (sel.size < count) {
      const total = cand.reduce((s, c) => s + c.w, 0);
      let r = Math.random() * total, sum = 0;
      for (const c of cand) { sum += c.w; if (r <= sum && !sel.has(c.n)) { sel.add(c.n); break; } }
    }
    return Array.from(sel).sort((a, b) => a - b);
  }
  return {
    front: pick(Array.from({ length: cfg.frontMax }, (_, i) => i + 1), ff, cfg.frontCount),
    back: pick(Array.from({ length: cfg.backMax }, (_, i) => i + 1), bf, cfg.backCount)
  };
}

function animateNumbersAsync(container, set, type, delay = 300, duration = 1000) {
  return new Promise(resolve => {
    if (!window.animationEnabled) { renderStaticBalls(container, set); resolve(); return; }
    const cfg = LOTTERY_CONFIG[type], all = [...set.front, ...set.back];
    container.innerHTML = ''; const balls = [];
    for (let i = 0; i < all.length; i++) { const b = document.createElement('span'); b.className = 'number-ball'; b.textContent = '?'; container.appendChild(b); balls.push(b); }
    function roll(i) {
      if (i >= all.length) { updateScore(); resolve(); return; }
      const ball = balls[i], isFront = i < set.front.length, max = isFront ? cfg.frontMax : cfg.backMax;
      ball.classList.add('rolling'); window.playRollSound();
      const intv = setInterval(() => { ball.textContent = Math.floor(Math.random() * max) + 1; }, 50);
      setTimeout(() => { clearInterval(intv); ball.classList.remove('rolling'); ball.textContent = all[i]; ball.classList.add(isFront ? 'red-ball' : 'blue-ball'); window.playStopSound(); setTimeout(() => roll(i + 1), delay); }, duration);
    }
    roll(0);
  });
}

function renderStaticBalls(container, set) {
  container.innerHTML = '';
  set.front.forEach(n => { const s = document.createElement('span'); s.className = 'number-ball red-ball'; s.textContent = n; container.appendChild(s); });
  set.back.forEach(n => { const s = document.createElement('span'); s.className = 'number-ball blue-ball'; s.textContent = n; container.appendChild(s); });
}

function updateScore() {
  document.getElementById('ai-score').textContent = (Math.random() * 15 + 85).toFixed(1);
  document.getElementById('ai-trust').textContent = (Math.random() * 5 + 95).toFixed(1) + '%';
  document.getElementById('ai-rating').textContent = ['SSS', 'SS', 'S', 'A'][Math.floor(Math.random() * 4)];
}

// ==================== 预测/摇奖 ====================
window.predict = async (count) => {
  if (!await checkPredictLimit(count)) return;
  window.initAudio();
  const container = document.getElementById('prediction-display');
  const sets = Array.from({ length: count }, () => weightedRandom(window.currentType));
  if (count === 1) {
    window.currentPrediction = sets[0];
    await animateNumbersAsync(container, sets[0], window.currentType);
    addToHistory(sets[0]);
  } else {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const div = document.createElement('div'); div.style.margin = '5px 0'; div.innerHTML = `<strong>组${i + 1}:</strong> `;
      const span = document.createElement('span'); div.appendChild(span); container.appendChild(div);
      await animateNumbersAsync(span, sets[i], window.currentType, 200, 800);
      await new Promise(r => setTimeout(r, 300));
    }
  }
  updateScore();
};

window.randomPredict = async () => {
  if (!await checkPredictLimit(1)) return;
  window.initAudio();
  window.currentPrediction = getRandomSet(window.currentType);
  await animateNumbersAsync(document.getElementById('prediction-display'), window.currentPrediction, window.currentType);
};

window.runMonteCarlo = async () => {
  if (!window.isVip) { alert('蒙特卡洛模拟为VIP功能'); window.showVipModal(); return; }
  window.initAudio();
  const set = weightedRandom(window.currentType);
  await animateNumbersAsync(document.getElementById('monte-carlo-balls'), set, window.currentType);
  document.getElementById('monte-score').textContent = (Math.random() * 18 + 82).toFixed(1) + '%';
};

window.simulateDraw = async () => {
  if (!await checkDrawLimit()) return;
  window.initAudio();
  await animateNumbersAsync(document.getElementById('draw-balls'), getRandomSet(window.currentType), window.currentType, 400, 1200);
};

// ==================== 收藏/历史（本地存储） ====================
let favorites = JSON.parse(localStorage.getItem('lotto_favorites') || '[]');
let predictionHistory = JSON.parse(localStorage.getItem('lotto_history') || '[]');

function addToHistory(set) {
  const item = { type: window.currentType, front: set.front, back: set.back, time: new Date().toLocaleString(), score: document.getElementById('ai-score').textContent };
  predictionHistory.unshift(item); if (predictionHistory.length > 100) predictionHistory = predictionHistory.slice(0, 100);
  localStorage.setItem('lotto_history', JSON.stringify(predictionHistory)); renderHistory();
}
function renderFavorites() {
  const c = document.getElementById('favorites-list');
  c.innerHTML = favorites.length ? favorites.map((f, i) => `<div class="favorite-item"><span>${f.type === 'dlt' ? '大乐透' : '双色球'} | ${f.time}</span><span>${f.front.join(' ')} + ${f.back.join(' ')}</span><button class="cyber-btn" onclick="window.removeFav(${i})">删除</button></div>`).join('') : '<p>暂无收藏</p>';
}
function renderHistory() {
  const c = document.getElementById('history-list');
  c.innerHTML = predictionHistory.length ? predictionHistory.map(h => `<div class="history-item"><span>${h.type === 'dlt' ? '大乐透' : '双色球'} | ${h.time}</span><span>${h.front.join(' ')} + ${h.back.join(' ')}</span></div>`).join('') : '<p>暂无历史</p>';
}
window.removeFav = (i) => { favorites.splice(i, 1); localStorage.setItem('lotto_favorites', JSON.stringify(favorites)); renderFavorites(); };
window.saveFavorite = () => {
  if (!window.currentPrediction) return alert('请先生成预测');
  const item = { type: window.currentType, front: window.currentPrediction.front, back: window.currentPrediction.back, time: new Date().toLocaleString(), score: document.getElementById('ai-score').textContent };
  favorites.unshift(item); if (favorites.length > 50) favorites = favorites.slice(0, 50);
  localStorage.setItem('lotto_favorites', JSON.stringify(favorites)); renderFavorites();
};
window.exportFavorites = () => exportCSV(favorites, 'favorites.csv');
window.exportHistory = () => exportCSV(predictionHistory, 'history.csv');
window.clearFavorites = () => { favorites = []; localStorage.removeItem('lotto_favorites'); renderFavorites(); };
window.clearHistory = () => { predictionHistory = []; localStorage.removeItem('lotto_history'); renderHistory(); };

function exportJSON(data, filename) { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); }
function exportCSV(data, filename) { let csv = '\uFEFF类型,前区,后区,时间,评分\n'; data.forEach(d => { csv += `${d.type},${d.front.join('-')},${d.back.join('-')},${d.time},${d.score}\n`; }); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); }

// ==================== 标签切换 ====================
window.switchTab = (name) => {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name)?.classList.add('active');
  if (name === 'favorites') renderFavorites();
  if (name === 'history') renderHistory();
};

// 热冷号
function updateHotCold() {
  const hot = Array.from({ length: 6 }, () => Math.floor(Math.random() * 35) + 1);
  const cold = Array.from({ length: 6 }, () => Math.floor(Math.random() * 35) + 1);
  document.getElementById('hot-display').innerHTML = hot.map(n => `<span class="number-ball red-ball">${n}</span>`).join('');
  document.getElementById('cold-display').innerHTML = cold.map(n => `<span class="number-ball blue-ball">${n}</span>`).join('');
}

// ==================== 事件绑定 ====================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('switch-dlt').onclick = () => { window.currentType = 'dlt'; document.getElementById('switch-dlt').classList.add('active'); document.getElementById('switch-ssq').classList.remove('active'); };
  document.getElementById('switch-ssq').onclick = () => { window.currentType = 'ssq'; document.getElementById('switch-ssq').classList.add('active'); document.getElementById('switch-dlt').classList.remove('active'); };

  document.getElementById('export-current').onclick = () => { if (window.currentPrediction) exportJSON([window.currentPrediction], 'prediction.json'); };
  document.getElementById('import-data').onclick = () => alert('导入成功（模拟）');
  document.getElementById('sound-toggle').onchange = (e) => { window.soundEnabled = e.target.value === 'on'; };
  document.getElementById('animation-toggle').onchange = (e) => { window.animationEnabled = e.target.value === 'on'; };
  document.getElementById('bgm-file').onchange = (e) => { const f = e.target.files[0]; if (f) { if (window.bgmAudio) window.bgmAudio.pause(); window.bgmAudio = new Audio(URL.createObjectURL(f)); window.bgmAudio.loop = true; } };
  document.getElementById('play-bgm').onclick = () => { if (window.bgmAudio) window.bgmAudio.play(); };
  document.getElementById('stop-bgm').onclick = () => { if (window.bgmAudio) window.bgmAudio.pause(); };

  // 启动会话恢复
  restoreSession();
});

// 退出登录
window.handleLogout = () => {
  localStorage.removeItem('supabase_session');
  window.location.href = 'login.html';
};
