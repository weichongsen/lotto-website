// ============================
// 1. Supabase 配置（请替换为您的真实凭证）
// ============================
const SUPABASE_URL = 'https://qwvrojfdripeswuocgpo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5c2rAccL-qR_QX7iAiQXiw_IdCVF_a4';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================
// 2. 全局状态
// ============================
let currentUser = null;           // { id, username, remain, is_vip }
let currentType = 'dlt';
let currentPrediction = null;
let historyDB = { dlt: [], ssq: [] };
let animationEnabled = true;
let soundEnabled = true;
let audioCtx = null;
let bgmAudio = null;

// ============================
// 3. 工具函数
// ============================
function getConfig(type) {
  if (type === 'dlt') return { frontMax: 35, backMax: 12, frontCount: 5, backCount: 2, label: '大乐透' };
  return { frontMax: 33, backMax: 16, frontCount: 6, backCount: 1, label: '双色球' };
}
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pickN(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n).sort((a, b) => a - b);
}
function formatNum(n) { return String(n).padStart(2, '0'); }
function getRandomSet(type) {
  const cfg = getConfig(type);
  const front = pickN(Array.from({ length: cfg.frontMax }, (_, i) => i + 1), cfg.frontCount);
  const back = pickN(Array.from({ length: cfg.backMax }, (_, i) => i + 1), cfg.backCount);
  return { front, back };
}
function getRating(score) { return { label: '--', cls: 'rating-badge' }; } // 不显示评分

// ============================
// 4. 音效
// ============================
function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function playBeep(freq = 520, type = 'square', duration = 0.1, vol = 0.06) {
  if (!soundEnabled || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}
function playRollSound() { playBeep(620, 'square', 0.04); }
function playStopSound() { playBeep(920, 'sine', 0.1); }

// ============================
// 5. 用户认证（Supabase）
// ============================
async function login(username, password) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .single();
  if (error || !data) throw new Error('用户名或密码错误');
  return data;
}
async function register(username, password) {
  // 检查用户名是否已存在
  const { data: existing } = await supabase
    .from('users')
    .select('username')
    .eq('username', username)
    .single();
  if (existing) throw new Error('用户名已被注册');
  
  const { data, error } = await supabase
    .from('users')
    .insert([{ username, password, remain: 10, is_vip: false }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ============================
// 6. UI 控制
// ============================
function showApp() {
  document.getElementById('app-container').style.display = 'block';
  document.getElementById('auth-modal').style.display = 'none';
  updateUserInfo();
  switchTab('prediction');
}
function hideApp() {
  document.getElementById('app-container').style.display = 'none';
  document.getElementById('auth-modal').style.display = 'flex';
}
function updateUserInfo() {
  if (!currentUser) return;
  document.getElementById('user-info').textContent = `👤 ${currentUser.username} (${currentUser.is_vip ? 'VIP' : '普通'})`;
  document.getElementById('remain-count').textContent = currentUser.remain;
  document.getElementById('vip-status').textContent = currentUser.is_vip ? 'VIP用户' : '普通用户';
}

// ============================
// 7. 摇奖次数与VIP
// ============================
async function consumeRemain() {
  if (currentUser.is_vip) return true; // VIP 无限
  if (currentUser.remain <= 0) {
    alert('免费摇奖次数已用完，请升级VIP！');
    return false;
  }
  currentUser.remain -= 1;
  await supabase.from('users').update({ remain: currentUser.remain }).eq('id', currentUser.id);
  updateUserInfo();
  return true;
}
async function upgradeVIP() {
  if (currentUser.is_vip) {
    alert('您已经是VIP用户！');
    return;
  }
  const confirm = window.confirm('💎 升级VIP需要支付 $9.99，是否继续？');
  if (!confirm) return;
  // 模拟支付成功，实际应通过 Cloudflare Worker 处理
  const { error } = await supabase
    .from('users')
    .update({ is_vip: true, remain: 999 })
    .eq('id', currentUser.id);
  if (!error) {
    currentUser.is_vip = true;
    currentUser.remain = 999;
    updateUserInfo();
    alert('🎉 升级成功！您现在享有无限次数和全部功能！');
  } else {
    alert('升级失败，请稍后重试');
  }
}

// ============================
// 8. 真实数据获取（从 Supabase lottery_data 表）
// ============================
async function fetchRealData(type) {
  try {
    const { data, error } = await supabase
      .from('lottery_data')
      .select('*')
      .eq('type', type)
      .order('date', { ascending: false })
      .limit(300);
    if (error) throw error;
    if (data && data.length > 0) {
      return data.map(d => ({ front: d.front, back: d.back }));
    } else {
      // 若无数据，生成模拟数据并插入（可选）
      const mock = Array.from({ length: 80 }, () => getRandomSet(type));
      // 注意：此处不自动插入，仅返回模拟数据
      return mock;
    }
  } catch (e) {
    console.warn('使用模拟数据', e);
    return Array.from({ length: 80 }, () => getRandomSet(type));
  }
}
async function initHistory() {
  historyDB.dlt = await fetchRealData('dlt');
  historyDB.ssq = await fetchRealData('ssq');
}

// ============================
// 9. 频率与加权随机
// ============================
function getFrequency(type) {
  const frontMap = new Map(), backMap = new Map();
  (historyDB[type] || []).forEach(d => {
    d.front.forEach(n => frontMap.set(n, (frontMap.get(n) || 0) + 1));
    d.back.forEach(n => backMap.set(n, (backMap.get(n) || 0) + 1));
  });
  return { front: frontMap, back: backMap };
}
function weightedRandom(type) {
  const freq = getFrequency(type);
  const cfg = getConfig(type);
  function pick(pool, freqMap, count) {
    let selected = new Set();
    let candidates = pool.map(n => ({ n, w: (freqMap.get(n) || 1) + 0.5 }));
    while (selected.size < count) {
      let totalW = candidates.reduce((s, c) => s + c.w, 0);
      let rand = Math.random() * totalW, sum = 0;
      for (let c of candidates) {
        sum += c.w;
        if (rand <= sum && !selected.has(c.n)) { selected.add(c.n); break; }
      }
    }
    return Array.from(selected).sort((a, b) => a - b);
  }
  const frontPool = Array.from({ length: cfg.frontMax }, (_, i) => i + 1);
  const backPool = Array.from({ length: cfg.backMax }, (_, i) => i + 1);
  return { front: pick(frontPool, freq.front, cfg.frontCount), back: pick(backPool, freq.back, cfg.backCount) };
}

// ============================
// 10. 滚动动画（核心）
// ============================
function animateNumbersOnly(container, finalSet, type, delayBetween = 300, rollDuration = 1000) {
  return new Promise(resolve => {
    if (!animationEnabled) {
      renderStatic(container, finalSet);
      resolve();
      return;
    }
    const cfg = getConfig(type);
    const allNumbers = finalSet.front.concat(finalSet.back);
    container.innerHTML = '';
    const balls = [];
    for (let i = 0; i < allNumbers.length; i++) {
      const ball = document.createElement('span');
      ball.className = 'number-ball';
      ball.textContent = '?';
      container.appendChild(ball);
      balls.push(ball);
    }
    function rollBall(index) {
      if (index >= allNumbers.length) { resolve(); return; }
      const ball = balls[index];
      const isFront = index < finalSet.front.length;
      const maxNum = isFront ? cfg.frontMax : cfg.backMax;
      ball.classList.add('rolling');
      playRollSound();
      const interval = setInterval(() => {
        ball.textContent = Math.floor(Math.random() * maxNum) + 1;
      }, 60);
      setTimeout(() => {
        clearInterval(interval);
        ball.classList.remove('rolling');
        ball.textContent = allNumbers[index];
        if (isFront) ball.classList.add('red-ball');
        else ball.classList.add('blue-ball');
        playStopSound();
        setTimeout(() => rollBall(index + 1), delayBetween);
      }, rollDuration);
    }
    rollBall(0);
  });
}
function renderStatic(container, set) {
  container.innerHTML = '';
  set.front.forEach(n => {
    const s = document.createElement('span');
    s.className = 'number-ball red-ball';
    s.textContent = n;
    container.appendChild(s);
  });
  set.back.forEach(n => {
    const s = document.createElement('span');
    s.className = 'number-ball blue-ball';
    s.textContent = n;
    container.appendChild(s);
  });
}

// ============================
// 11. 预测功能（不显示评分）
// ============================
async function generatePrediction(count = 1) {
  initAudio();
  const container = document.getElementById('prediction-display');
  container.innerHTML = '';
  if (count === 1) {
    const set = weightedRandom(currentType);
    currentPrediction = set;
    await animateNumbersOnly(container, set, currentType);
    // 不显示评分
    if (currentUser) saveHistory(set);
  } else {
    // 多组预测
    const sets = Array.from({ length: count }, () => weightedRandom(currentType));
    const grid = document.createElement('div');
    grid.className = 'prediction-grid';
    const leftCol = document.createElement('div');
    leftCol.className = 'prediction-column';
    const rightCol = document.createElement('div');
    rightCol.className = 'prediction-column';
    grid.appendChild(leftCol);
    grid.appendChild(rightCol);
    container.appendChild(grid);

    const items = [];
    for (let i = 0; i < count; i++) {
      const item = document.createElement('div');
      item.className = 'prediction-item';
      item.innerHTML = `<strong style="color:#00F5FF; min-width:45px;">组${i+1}</strong>`;
      const ballContainer = document.createElement('span');
      item.appendChild(ballContainer);
      if (i < Math.ceil(count / 2)) leftCol.appendChild(item);
      else rightCol.appendChild(item);
      items.push({ item, ballContainer, set: sets[i] });
    }
    for (let i = 0; i < items.length; i++) {
      items[i].item.style.border = '2px solid #FFD700';
      items[i].item.style.boxShadow = '0 0 20px #FFD700';
      await animateNumbersOnly(items[i].ballContainer, items[i].set, currentType, 200, 800);
      items[i].item.style.border = '1px solid rgba(0, 245, 255, 0.2)';
      items[i].item.style.boxShadow = 'none';
      await new Promise(r => setTimeout(r, 300));
    }
    if (sets.length > 0 && currentUser) saveHistory(sets[0]);
  }
}
function randomPick() {
  const set = getRandomSet(currentType);
  currentPrediction = set;
  const container = document.getElementById('prediction-display');
  renderStatic(container, set);
  // 不显示评分
}
async function saveHistory(set) {
  if (!currentUser) return;
  await supabase.from('history').insert([{
    user_id: currentUser.id,
    type: currentType,
    front: set.front,
    back: set.back,
    score: '未开通'
  }]);
}
async function saveFavorite(set) {
  if (!currentUser) return;
  await supabase.from('favorites').insert([{
    user_id: currentUser.id,
    type: currentType,
    front: set.front,
    back: set.back,
    score: '未开通'
  }]);
  alert('已收藏');
}

// ============================
// 12. 蒙特卡洛（页面1 & 高级引擎）
// ============================
async function runMonteCarloPage(n) {
  initAudio();
  const container = document.getElementById('monte-carlo-balls');
  const scoreSpan = document.getElementById('monte-score');
  const freq = {};
  for (let i = 0; i < n; i++) {
    const set = weightedRandom(currentType);
    const key = set.front.join(',') + '|' + set.back.join(',');
    freq[key] = (freq[key] || 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return;
  const best = sorted[0];
  const parts = best[0].split('|');
  const front = parts[0].split(',').map(Number);
  const back = parts[1].split(',').map(Number);
  const set = { front, back };
  container.innerHTML = '';
  await animateNumbersOnly(container, set, currentType, 200, 800);
  const prob = (best[1] / n * 100);
  scoreSpan.textContent = prob.toFixed(1) + '%';
  const info = document.createElement('div');
  info.style.width = '100%';
  info.style.marginTop = '8px';
  info.style.color = '#aaa';
  info.textContent = `出现次数: ${best[1]} / ${n} (${prob.toFixed(2)}%)`;
  container.appendChild(info);
}
async function runMonteCarloAdvanced(n) {
  initAudio();
  const result = document.getElementById('mc-result');
  if (!result) return;
  const freq = {};
  for (let i = 0; i < n; i++) {
    const set = weightedRandom(currentType);
    const key = set.front.join(',') + '|' + set.back.join(',');
    freq[key] = (freq[key] || 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return;
  const best = sorted[0];
  const parts = best[0].split('|');
  const front = parts[0].split(',').map(Number);
  const back = parts[1].split(',').map(Number);
  const set = { front, back };
  result.innerHTML = '';
  await animateNumbersOnly(result, set, currentType, 200, 800);
  const info = document.createElement('div');
  info.style.marginTop = '10px';
  info.style.color = '#aaa';
  info.textContent = `出现次数: ${best[1]} / ${n} (${(best[1]/n*100).toFixed(2)}%)`;
  result.appendChild(info);
}

// ============================
// 13. 马尔可夫链
// ============================
function runMarkov() {
  const result = document.getElementById('markov-result');
  if (!result) return;
  const data = historyDB[currentType];
  if (data.length < 5) { result.innerHTML = '历史数据不足'; return; }
  const trans = {};
  for (let i = 0; i < data.length - 1; i++) {
    const cur = data[i].front.join(',');
    const next = data[i + 1].front.join(',');
    if (!trans[cur]) trans[cur] = {};
    trans[cur][next] = (trans[cur][next] || 0) + 1;
  }
  const entries = Object.entries(trans).slice(0, 5);
  let html = '前区转移矩阵 (Top 5):<br>';
  entries.forEach(([from, tos]) => {
    const sorted = Object.entries(tos).sort((a, b) => b[1] - a[1]).slice(0, 3);
    html += `${from} → ${sorted.map(([t,c])=>`${t}(${c}次)`).join(' | ')}<br>`;
  });
  result.innerHTML = html;
}

// ============================
// 14. 贝叶斯（滚动动画）
// ============================
async function runBayes() {
  initAudio();
  const result = document.getElementById('bayes-result');
  if (!result) return;
  const freq = getFrequency(currentType);
  const cfg = getConfig(currentType);
  const sortedFront = [...freq.front.entries()].sort((a, b) => b[1] - a[1]);
  const sortedBack = [...freq.back.entries()].sort((a, b) => b[1] - a[1]);
  const front = sortedFront.slice(0, cfg.frontCount).map(([n]) => Number(n)).sort((a, b) => a - b);
  const back = sortedBack.slice(0, cfg.backCount).map(([n]) => Number(n)).sort((a, b) => a - b);
  const set = { front, back };
  result.innerHTML = '';
  await animateNumbersOnly(result, set, currentType, 200, 800);
  const total = historyDB[currentType].length * cfg.frontCount;
  const prob = (sortedFront[0]?.[1] / total * 100 || 0).toFixed(2);
  const info = document.createElement('div');
  info.style.marginTop = '10px';
  info.style.color = '#aaa';
  info.textContent = `最高概率号码: ${sortedFront[0]?.[0]} (${prob}%)`;
  result.appendChild(info);
}

// ============================
// 15. 综合评分（滚动动画，不显示评分）
// ============================
async function runEnsemble() {
  initAudio();
  const result = document.getElementById('ensemble-result');
  if (!result) return;
  const set = weightedRandom(currentType);
  result.innerHTML = '';
  await animateNumbersOnly(result, set, currentType, 200, 800);
  const info = document.createElement('div');
  info.style.marginTop = '10px';
  info.style.color = '#aaa';
  info.innerHTML = `综合评分: 未开通`;
  result.appendChild(info);
}

// ============================
// 16. 摇奖模拟（消耗次数）
// ============================
async function startDraw() {
  initAudio();
  if (!(await consumeRemain())) return;
  const container = document.getElementById('draw-balls');
  container.innerHTML = '';
  const set = getRandomSet(currentType);
  await animateNumbersOnly(container, set, currentType, 200, 800);
  if (currentUser) saveHistory(set);
}

// ============================
// 17. 分析中心（显示热号等）
// ============================
function renderAnalysis(tab) {
  const container = document.getElementById('analysis-content');
  const freq = getFrequency(currentType);
  const cfg = getConfig(currentType);
  let html = '';
  if (tab === 'hot') {
    const hot = [...freq.front.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    html = `<h4>🔥 热号TOP10</h4><div class="inline-balls">${hot.map(([n,c])=>`<span class="number-ball red-ball">${n}<span style="display:block;font-size:0.5rem;">${c}</span></span>`).join('')}</div>`;
  } else if (tab === 'cold') {
    const cold = [...freq.front.entries()].sort((a, b) => a[1] - b[1]).slice(0, 10);
    html = `<h4>❄️ 冷号TOP10</h4><div class="inline-balls">${cold.map(([n,c])=>`<span class="number-ball blue-ball">${n}<span style="display:block;font-size:0.5rem;">${c}</span></span>`).join('')}</div>`;
  } else if (tab === 'miss') {
    const miss = Array.from({ length: 10 }, () => ({ n: rand(1, cfg.frontMax), v: rand(0, 20) }));
    html = `<h4>⏳ 当前遗漏排行</h4><div class="inline-balls">${miss.sort((a,b)=>b.v-a.v).slice(0,10).map(({n,v})=>`<span class="number-ball" style="border-color:#FFD700;">${n}<span style="display:block;font-size:0.5rem;">${v}期</span></span>`).join('')}</div>`;
  } else if (tab === 'sum') {
    const sums = historyDB[currentType].map(d => d.front.reduce((a, b) => a + b, 0));
    const dist = {};
    sums.forEach(s => { const key = Math.floor(s / 10) * 10; dist[key] = (dist[key] || 0) + 1; });
    html = `<h4>📐 和值分布</h4><div>${Object.entries(dist).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`<span style="display:inline-block;margin:5px;padding:4px 12px;background:rgba(0,245,255,0.1);border-radius:12px;">${k}-${k+9}: ${v}次</span>`).join('')}</div>`;
  } else if (tab === 'oe') {
    const odd = historyDB[currentType].flatMap(d => d.front).filter(n => n % 2 === 1).length;
    const even = historyDB[currentType].flatMap(d => d.front).filter(n => n % 2 === 0).length;
    html = `<h4>⚖️ 奇偶比例</h4><div>奇数: ${odd} (${(odd/(odd+even)*100).toFixed(1)}%) &nbsp; 偶数: ${even} (${(even/(odd+even)*100).toFixed(1)}%)</div>`;
  } else if (tab === 'size') {
    const mid = cfg.frontMax / 2;
    const big = historyDB[currentType].flatMap(d => d.front).filter(n => n > mid).length;
    const small = historyDB[currentType].flatMap(d => d.front).filter(n => n <= mid).length;
    html = `<h4>📏 大小比例 (大 > ${mid})</h4><div>大号: ${big} (${(big/(big+small)*100).toFixed(1)}%) &nbsp; 小号: ${small} (${(small/(big+small)*100).toFixed(1)}%)</div>`;
  } else if (tab === 'consec') {
    let consecCount = 0;
    historyDB[currentType].forEach(d => {
      for (let i = 0; i < d.front.length - 1; i++) {
        if (d.front[i + 1] - d.front[i] === 1) { consecCount++; break; }
      }
    });
    html = `<h4>🔗 连号出现频率</h4><div>出现连号的期数: ${consecCount} / ${historyDB[currentType].length} (${(consecCount/historyDB[currentType].length*100).toFixed(1)}%)</div>`;
  } else if (tab === 'repeat') {
    let repeatTotal = 0;
    for (let i = 0; i < historyDB[currentType].length - 1; i++) {
      const cur = historyDB[currentType][i].front;
      const next = historyDB[currentType][i + 1].front;
      const common = cur.filter(n => next.includes(n)).length;
      repeatTotal += common;
    }
    const avg = repeatTotal / (historyDB[currentType].length - 1) || 0;
    html = `<h4>🔄 重号分析</h4><div>平均每期重号: ${avg.toFixed(2)} 个</div><div>重号概率: ${(avg/cfg.frontCount*100).toFixed(1)}%</div>`;
  } else if (tab === 'ac') {
    const acValues = historyDB[currentType].map(d => {
      const diffs = [];
      for (let i = 0; i < d.front.length; i++)
        for (let j = i + 1; j < d.front.length; j++) diffs.push(Math.abs(d.front[j] - d.front[i]));
      return new Set(diffs).size - (d.front.length - 1);
    });
    const dist2 = {};
    acValues.forEach(v => { dist2[v] = (dist2[v] || 0) + 1; });
    html = `<h4>🔢 AC值分布</h4><div>${Object.entries(dist2).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`<span style="display:inline-block;margin:5px;padding:4px 12px;background:rgba(0,245,255,0.1);border-radius:12px;">AC=${k}: ${v}次</span>`).join('')}</div>`;
  } else if (tab === 'span') {
    const spans = historyDB[currentType].map(d => Math.max(...d.front) - Math.min(...d.front));
    const dist3 = {};
    spans.forEach(s => { const key = Math.floor(s / 5) * 5; dist3[key] = (dist3[key] || 0) + 1; });
    html = `<h4>📏 跨度分布</h4><div>${Object.entries(dist3).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`<span style="display:inline-block;margin:5px;padding:4px 12px;background:rgba(0,245,255,0.1);border-radius:12px;">${k}-${k+4}: ${v}次</span>`).join('')}</div>`;
  }
  container.innerHTML = html;
}

// ============================
// 18. 高级引擎渲染
// ============================
function renderAdvanced(tab) {
  const container = document.getElementById('advanced-content');
  let html = '';
  if (tab === 'monte') {
    html = `
      <h4>🎲 蒙特卡洛模拟</h4>
      <button class="cyber-btn" id="mc-1k">1,000次</button>
      <button class="cyber-btn" id="mc-10k">10,000次</button>
      <button class="cyber-btn" id="mc-50k">50,000次</button>
      <button class="cyber-btn" id="mc-100k">100,000次</button>
      <div id="mc-result" class="adv-result-box">点击运行模拟</div>
    `;
  } else if (tab === 'markov') {
    html = `
      <h4>🔗 马尔可夫链分析</h4>
      <button class="cyber-btn" id="markov-run">运行分析</button>
      <div id="markov-result" class="adv-result-box">点击运行</div>
    `;
  } else if (tab === 'bayes') {
    html = `
      <h4>📊 贝叶斯分析</h4>
      <button class="cyber-btn" id="bayes-run">运行分析</button>
      <div id="bayes-result" class="adv-result-box">点击运行</div>
    `;
  } else if (tab === 'ensemble') {
    html = `
      <h4>🧩 综合评分模型</h4>
      <button class="cyber-btn" id="ensemble-run">运行综合评分</button>
      <div id="ensemble-result" class="adv-result-box">点击运行</div>
    `;
  }
  container.innerHTML = html;
  // 绑定事件
  document.getElementById('mc-1k')?.addEventListener('click', () => runMonteCarloAdvanced(1000));
  document.getElementById('mc-10k')?.addEventListener('click', () => runMonteCarloAdvanced(10000));
  document.getElementById('mc-50k')?.addEventListener('click', () => runMonteCarloAdvanced(50000));
  document.getElementById('mc-100k')?.addEventListener('click', () => runMonteCarloAdvanced(100000));
  document.getElementById('markov-run')?.addEventListener('click', runMarkov);
  document.getElementById('bayes-run')?.addEventListener('click', runBayes);
  document.getElementById('ensemble-run')?.addEventListener('click', runEnsemble);
}

// ============================
// 19. ECharts 图表
// ============================
let chartInstance = null;
function renderChart(type) {
  const container = document.getElementById('chart-container');
  if (!chartInstance) chartInstance = echarts.init(container);
  let option = { backgroundColor: 'transparent' };
  if (type === 'hotTrend') {
    const hot = [...getFrequency(currentType).front.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7);
    option = {
      title: { text: '热号趋势', textStyle: { color: '#00F5FF' } },
      xAxis: { type: 'category', data: hot.map(([n])=>formatNum(n)), axisLabel: { color: '#aaa' } },
      yAxis: { type: 'value', axisLabel: { color: '#aaa' }, splitLine: { lineStyle: { color: 'rgba(0,245,255,0.1)' } } },
      series: [{ type: 'line', data: hot.map(([,c])=>c), smooth: true, lineStyle: { color: '#FF4D6D' }, areaStyle: { color: 'rgba(255,77,109,0.2)' } }]
    };
  } else if (type === 'coldTrend') {
    const cold = [...getFrequency(currentType).front.entries()].sort((a,b)=>a[1]-b[1]).slice(0,7);
    option = {
      title: { text: '冷号趋势', textStyle: { color: '#6E00FF' } },
      xAxis: { type: 'category', data: cold.map(([n])=>formatNum(n)), axisLabel: { color: '#aaa' } },
      yAxis: { type: 'value', axisLabel: { color: '#aaa' }, splitLine: { lineStyle: { color: 'rgba(0,245,255,0.1)' } } },
      series: [{ type: 'line', data: cold.map(([,c])=>c), smooth: true, lineStyle: { color: '#00F5FF' }, areaStyle: { color: 'rgba(0,245,255,0.2)' } }]
    };
  } else if (type === 'missTrend') {
    option = {
      title: { text: '遗漏走势', textStyle: { color: '#FFD700' } },
      xAxis: { type: 'category', data: Array.from({ length: 20 }, (_, i) => `期${i+1}`), axisLabel: { color: '#aaa' } },
      yAxis: { type: 'value', axisLabel: { color: '#aaa' }, splitLine: { lineStyle: { color: 'rgba(0,245,255,0.1)' } } },
      series: [{ type: 'line', data: Array.from({ length: 20 }, () => rand(0, 20)), smooth: true, lineStyle: { color: '#FF4D6D' }, areaStyle: { color: 'rgba(255,77,109,0.2)' } }]
    };
  } else if (type === 'sumTrend') {
    option = {
      title: { text: '和值走势', textStyle: { color: '#00FF9D' } },
      xAxis: { type: 'category', data: Array.from({ length: 30 }, (_, i) => `期${i+1}`), axisLabel: { color: '#aaa' } },
      yAxis: { type: 'value', axisLabel: { color: '#aaa' }, splitLine: { lineStyle: { color: 'rgba(0,245,255,0.1)' } } },
      series: [{ type: 'line', data: historyDB[currentType].slice(0,30).map(d => d.front.reduce((a,b)=>a+b,0)), smooth: true, lineStyle: { color: '#00FF9D' }, areaStyle: { color: 'rgba(0,255,157,0.2)' } }]
    };
  } else if (type === 'oePie') {
    const odd = historyDB[currentType].flatMap(d => d.front).filter(n => n % 2 === 1).length;
    const even = historyDB[currentType].flatMap(d => d.front).filter(n => n % 2 === 0).length;
    option = {
      title: { text: '奇偶比例', textStyle: { color: '#00F5FF' } },
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: ['40%','70%'], data: [{value: odd, name:'奇数'}, {value: even, name:'偶数'}], color: ['#FF4D6D','#00F5FF'], label: { color: '#aaa' } }]
    };
  } else if (type === 'sizePie') {
    const mid = getConfig(currentType).frontMax / 2;
    const big = historyDB[currentType].flatMap(d => d.front).filter(n => n > mid).length;
    const small = historyDB[currentType].flatMap(d => d.front).filter(n => n <= mid).length;
    option = {
      title: { text: '大小比例', textStyle: { color: '#00F5FF' } },
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: ['40%','70%'], data: [{value: big, name:'大号'}, {value: small, name:'小号'}], color: ['#FFD700','#6E00FF'], label: { color: '#aaa' } }]
    };
  } else if (type === 'scoreTrend') {
    option = {
      title: { text: 'AI评分走势', textStyle: { color: '#FFD700' } },
      xAxis: { type: 'category', data: Array.from({ length: 20 }, (_, i) => `期${i+1}`), axisLabel: { color: '#aaa' } },
      yAxis: { type: 'value', min: 60, max: 100, axisLabel: { color: '#aaa' }, splitLine: { lineStyle: { color: 'rgba(0,245,255,0.1)' } } },
      series: [{ type: 'line', data: Array.from({ length: 20 }, () => rand(70, 98)), smooth: true, lineStyle: { color: '#FFD700' }, areaStyle: { color: 'rgba(255,215,0,0.2)' } }]
    };
  }
  chartInstance.setOption(option);
  chartInstance.resize();
}

// ============================
// 20. 收藏 & 历史（Supabase 操作）
// ============================
async function loadFavorites() {
  if (!currentUser) return;
  const { data, error } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('time', { ascending: false });
  if (error) return;
  const container = document.getElementById('favorites-list');
  if (data.length === 0) { container.innerHTML = '<p>暂无收藏</p>'; return; }
  container.innerHTML = data.map((f, i) => `
    <div class="favorite-item">
      <span>${f.type==='dlt'?'大乐透':'双色球'} | ${new Date(f.time).toLocaleString()}</span>
      <span class="inline-balls">
        ${f.front.map(n=>`<span class="number-ball red-ball" style="width:32px;height:32px;line-height:32px;font-size:0.8rem;">${n}</span>`).join('')}
        +
        ${f.back.map(n=>`<span class="number-ball blue-ball" style="width:32px;height:32px;line-height:32px;font-size:0.8rem;">${n}</span>`).join('')}
      </span>
      <button class="cyber-btn danger" onclick="window._removeFavorite('${f.id}')">删除</button>
    </div>
  `).join('');
}
window._removeFavorite = async function(id) {
  await supabase.from('favorites').delete().eq('id', id);
  loadFavorites();
};
async function loadHistory(limit = 0) {
  if (!currentUser) return;
  let query = supabase.from('history').select('*').eq('user_id', currentUser.id).order('time', { ascending: false });
  if (limit > 0) query = query.limit(limit);
  const { data, error } = await query;
  if (error) return;
  const container = document.getElementById('history-list');
  if (data.length === 0) { container.innerHTML = '<p>暂无历史</p>'; return; }
  container.innerHTML = data.map(h => `
    <div class="history-item">
      <span>${h.type==='dlt'?'大乐透':'双色球'} | ${new Date(h.time).toLocaleString()}</span>
      <span class="inline-balls">
        ${h.front.map(n=>`<span class="number-ball red-ball" style="width:32px;height:32px;line-height:32px;font-size:0.8rem;">${n}</span>`).join('')}
        +
        ${h.back.map(n=>`<span class="number-ball blue-ball" style="width:32px;height:32px;line-height:32px;font-size:0.8rem;">${n}</span>`).join('')}
      </span>
      <button class="cyber-btn danger" onclick="window._removeHistory('${h.id}')">删除</button>
    </div>
  `).join('');
}
window._removeHistory = async function(id) {
  await supabase.from('history').delete().eq('id', id);
  loadHistory(0);
};

// ============================
// 21. 导出工具
// ============================
function exportJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
function exportCSV(data, filename) {
  let csv = '类型,前区,后区,时间,评分\n';
  data.forEach(d => { csv += `${d.type},${d.front.join('-')},${d.back.join('-')},${d.time},${d.score||'未开通'}\n`; });
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ============================
// 22. Tab 切换
// ============================
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  if (tabName === 'favorites') loadFavorites();
  if (tabName === 'history') loadHistory(0);
  if (tabName === 'analysis') renderAnalysis('hot');
  if (tabName === 'advanced') renderAdvanced('monte');
  if (tabName === 'charts') renderChart('hotTrend');
}

// ============================
// 23. 退出
// ============================
async function logout() {
  currentUser = null;
  hideApp();
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
}

// ============================
// 24. 初始化
// ============================
async function init() {
  // 初始化历史数据
  await initHistory();

  // 检查本地存储是否有登录状态（可选）
  // 直接显示登录界面
  hideApp();

  // 绑定登录/注册事件
  document.getElementById('auth-login').addEventListener('click', async () => {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    try {
      const user = await login(username, password);
      currentUser = user;
      showApp();
      loadFavorites();
      loadHistory(0);
    } catch(e) {
      document.getElementById('auth-message').textContent = e.message;
    }
  });
  document.getElementById('auth-register').addEventListener('click', async () => {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    if (!username || !password) { document.getElementById('auth-message').textContent = '请填写完整'; return; }
    try {
      const user = await register(username, password);
      currentUser = user;
      showApp();
      loadFavorites();
      loadHistory(0);
    } catch(e) {
      document.getElementById('auth-message').textContent = e.message;
    }
  });

  // 绑定预测按钮
  document.getElementById('predict-1').addEventListener('click', ()=>generatePrediction(1));
  document.getElementById('predict-5').addEventListener('click', ()=>generatePrediction(5));
  document.getElementById('predict-10').addEventListener('click', ()=>generatePrediction(10));
  document.getElementById('random-btn').addEventListener('click', randomPick);
  document.getElementById('favorite-current').addEventListener('click', ()=>{
    if (currentPrediction) saveFavorite(currentPrediction);
  });
  document.getElementById('export-current').addEventListener('click', ()=>{
    if (currentPrediction) exportJSON([currentPrediction], 'prediction.json');
  });

  // 蒙特卡洛（页面1）
  document.getElementById('run-monte-1k').addEventListener('click', ()=>runMonteCarloPage(1000));
  document.getElementById('run-monte-10k').addEventListener('click', ()=>runMonteCarloPage(10000));
  document.getElementById('run-monte-50k').addEventListener('click', ()=>runMonteCarloPage(50000));
  document.getElementById('run-monte-100k').addEventListener('click', ()=>runMonteCarloPage(100000));

  // 摇奖
  document.getElementById('start-draw').addEventListener('click', startDraw);

  // VIP升级
  document.getElementById('upgrade-vip').addEventListener('click', upgradeVIP);

  // 彩种切换
  document.getElementById('switch-dlt').addEventListener('click', ()=>{
    currentType='dlt';
    document.getElementById('switch-dlt').classList.add('active');
    document.getElementById('switch-ssq').classList.remove('active');
    // 刷新当前tab内容
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) switchTab(activeTab.id.replace('tab-', ''));
  });
  document.getElementById('switch-ssq').addEventListener('click', ()=>{
    currentType='ssq';
    document.getElementById('switch-ssq').classList.add('active');
    document.getElementById('switch-dlt').classList.remove('active');
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) switchTab(activeTab.id.replace('tab-', ''));
  });

  // 分析tab切换
  document.querySelectorAll('#analysis-tabs .cyber-btn').forEach(btn => {
    btn.onclick = function() {
      document.querySelectorAll('#analysis-tabs .cyber-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      renderAnalysis(this.dataset.atab);
    };
  });
  renderAnalysis('hot');

  // 高级引擎tab切换
  document.querySelectorAll('#adv-tabs .cyber-btn').forEach(btn => {
    btn.onclick = function() {
      document.querySelectorAll('#adv-tabs .cyber-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      renderAdvanced(this.dataset.adv);
    };
  });
  renderAdvanced('monte');

  // 图表tab切换
  document.querySelectorAll('#chart-tabs .cyber-btn').forEach(btn => {
    btn.onclick = function() {
      document.querySelectorAll('#chart-tabs .cyber-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      renderChart(this.dataset.ctab);
    };
  });
  renderChart('hotTrend');

  // 收藏导出
  document.getElementById('export-favorites').addEventListener('click', async ()=>{
    if (!currentUser) return;
    const { data } = await supabase.from('favorites').select('*').eq('user_id', currentUser.id);
    if (data && data.length) exportCSV(data, 'favorites.csv');
  });
  document.getElementById('clear-favorites').addEventListener('click', async ()=>{
    if (!confirm('确定清空所有收藏？')) return;
    await supabase.from('favorites').delete().eq('user_id', currentUser.id);
    loadFavorites();
  });

  // 历史
  document.getElementById('hist-50').addEventListener('click', ()=>loadHistory(50));
  document.getElementById('hist-100').addEventListener('click', ()=>loadHistory(100));
  document.getElementById('hist-all').addEventListener('click', ()=>loadHistory(0));
  document.getElementById('hist-search-btn').addEventListener('click', async ()=>{
    const q = document.getElementById('hist-search').value.trim().toLowerCase();
    if (!q) { loadHistory(0); return; }
    const { data } = await supabase.from('history').select('*').eq('user_id', currentUser.id);
    const filtered = data.filter(h => {
      const str = [...h.front, ...h.back].join(' ');
      return str.includes(q);
    });
    const container = document.getElementById('history-list');
    if (filtered.length === 0) { container.innerHTML = '<p>无匹配结果</p>'; return; }
    container.innerHTML = filtered.map(h => `
      <div class="history-item">
        <span>${h.type==='dlt'?'大乐透':'双色球'} | ${new Date(h.time).toLocaleString()}</span>
        <span class="inline-balls">
          ${h.front.map(n=>`<span class="number-ball red-ball" style="width:32px;height:32px;line-height:32px;font-size:0.8rem;">${n}</span>`).join('')}
          +
          ${h.back.map(n=>`<span class="number-ball blue-ball" style="width:32px;height:32px;line-height:32px;font-size:0.8rem;">${n}</span>`).join('')}
        </span>
      </div>
    `).join('');
  });
  document.getElementById('export-history').addEventListener('click', async ()=>{
    if (!currentUser) return;
    const { data } = await supabase.from('history').select('*').eq('user_id', currentUser.id);
    if (data && data.length) exportCSV(data, 'history.csv');
  });
  document.getElementById('clear-history').addEventListener('click', async ()=>{
    if (!confirm('确定清空所有历史？')) return;
    await supabase.from('history').delete().eq('user_id', currentUser.id);
    loadHistory(0);
  });

  // 设置
  document.getElementById('theme-select').onchange = function() {
    const root = document.documentElement;
    const theme = this.value;
    if (theme === 'cyber') {
      root.style.setProperty('--ai-blue', '#FF00FF');
      root.style.setProperty('--tech-purple', '#00FFFF');
    } else if (theme === 'purple') {
      root.style.setProperty('--ai-blue', '#A855F7');
      root.style.setProperty('--tech-purple', '#6E00FF');
    } else if (theme === 'dark') {
      root.style.setProperty('--ai-blue', '#3B82F6');
      root.style.setProperty('--tech-purple', '#8B5CF6');
    } else {
      root.style.setProperty('--ai-blue', '#00F5FF');
      root.style.setProperty('--tech-purple', '#6E00FF');
    }
  };
  document.getElementById('animation-toggle').onchange = function() { animationEnabled = this.value === 'on'; };
  document.getElementById('sound-toggle').onchange = function() { soundEnabled = this.value === 'on'; };

  // 实验室：权重滑块
  document.querySelectorAll('input[data-w]').forEach(input => {
    input.oninput = function() {
      const key = this.dataset.w;
      document.getElementById('w-' + key).textContent = this.value;
    };
  });
  document.getElementById('apply-weights').onclick = function() {
    const weights = {};
    document.querySelectorAll('input[data-w]').forEach(inp => { weights[inp.dataset.w] = parseInt(inp.value); });
    localStorage.setItem('lotto_weights', JSON.stringify(weights));
    alert('权重已保存');
  };
  document.getElementById('apply-strategy').onclick = function() {
    const val = document.getElementById('strategy-select').value;
    let desc = '';
    if (val === 'balanced') desc = '平衡模式：均衡各项指标';
    else if (val === 'conservative') desc = '稳健模式：偏重热号和遗漏';
    else if (val === 'aggressive') desc = '激进模式：偏重马尔可夫和蒙特卡洛';
    else if (val === 'extreme') desc = '极限模式：追求高风险高回报';
    document.getElementById('strategy-desc').textContent = '当前策略: ' + desc;
    const map = {
      balanced: { hot:20, cold:10, miss:20, sum:15, oe:10, markov:20, monte:15 },
      conservative: { hot:30, cold:15, miss:25, sum:10, oe:5, markov:10, monte:5 },
      aggressive: { hot:10, cold:5, miss:10, sum:20, oe:5, markov:25, monte:25 },
      extreme: { hot:5, cold:5, miss:5, sum:25, oe:5, markov:30, monte:25 }
    };
    const w = map[val] || map.balanced;
    Object.keys(w).forEach(key => {
      const inp = document.querySelector(`input[data-w="${key}"]`);
      if (inp) { inp.value = w[key]; document.getElementById('w-' + key).textContent = w[key]; }
    });
  };

  // BGM
  document.getElementById('bgm-file').onchange = function(e) {
    const f = e.target.files[0];
    if (f) { if (bgmAudio) bgmAudio.pause(); bgmAudio = new Audio(URL.createObjectURL(f)); bgmAudio.loop = true; }
  };
  document.getElementById('play-bgm').onclick = () => { if (bgmAudio) bgmAudio.play(); };
  document.getElementById('stop-bgm').onclick = () => { if (bgmAudio) bgmAudio.pause(); };

  // 导出全部
  document.getElementById('export-all-json').onclick = async ()=>{
    if (!currentUser) return;
    const { data: fav } = await supabase.from('favorites').select('*').eq('user_id', currentUser.id);
    const { data: hist } = await supabase.from('history').select('*').eq('user_id', currentUser.id);
    exportJSON({ favorites: fav || [], history: hist || [] }, 'all_data.json');
  };
  document.getElementById('export-all-excel').onclick = async ()=>{
    if (!currentUser) return;
    const { data: fav } = await supabase.from('favorites').select('*').eq('user_id', currentUser.id);
    const { data: hist } = await supabase.from('history').select('*').eq('user_id', currentUser.id);
    const all = [...(fav||[]), ...(hist||[])];
    if (all.length) exportCSV(all, 'all_data.csv');
  };
  document.getElementById('reset-system').onclick = () => { if (confirm('确定重置？')) { localStorage.clear(); location.reload(); } };
  document.getElementById('clear-cache').onclick = () => { if (confirm('清理缓存？')) { localStorage.clear(); location.reload(); } };
}

// 页面加载后启动
document.addEventListener('DOMContentLoaded', init);