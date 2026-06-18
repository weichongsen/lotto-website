// 全局状态
let currentType = 'dlt'; // 'dlt' 或 'ssq'
let userVip = false;
let userRole = 'user';

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async () => {
  // 初始化粒子背景
  initParticles();

  // 检查登录状态（如未登录跳转到auth.html）
  const user = await getCurrentUser();
  if (!user && supabase) {
    window.location.href = 'auth.html';
    return;
  }
  if (user) {
    userVip = await checkVipStatus();
    userRole = (await checkAdminRole()) ? 'admin' : 'user';
    document.getElementById('vipBadge').style.display = userVip ? 'inline-block' : 'none';
    if (userRole === 'admin') {
      document.getElementById('adminPanel').style.display = 'block';
    }
  } else {
    // 演示模式，从localStorage读取
    const localUser = JSON.parse(localStorage.getItem('ai_lottery_user') || '{}');
    userVip = localUser.is_vip || false;
    userRole = localUser.role || 'user';
  }

  // 切换彩种按钮
  document.getElementById('switchDlt').addEventListener('click', () => switchType('dlt'));
  document.getElementById('switchSsq').addEventListener('click', () => switchType('ssq'));

  // AI预测按钮
  document.getElementById('predict1').addEventListener('click', () => generatePrediction(1));
  document.getElementById('predict5').addEventListener('click', () => generatePrediction(5));
  document.getElementById('predict10').addEventListener('click', () => generatePrediction(10));
  document.getElementById('randomBtn').addEventListener('click', () => {
    const nums = randomNumbers(currentType);
    displayNumbersInline(nums, 'predictionNumbers');
  });

  // 收藏按钮
  document.getElementById('saveFavorite').addEventListener('click', saveCurrentPrediction);

  // 摇奖机按钮
  document.getElementById('startDraw').addEventListener('click', startLotteryDraw);

  // 高级分析按钮（蒙特卡洛等）
  document.getElementById('monteCarloBtn').addEventListener('click', runMonteCarlo);

  // 管理员导入开奖数据
  document.getElementById('importDrawBtn')?.addEventListener('click', importDrawData);

  // 初始化图表
  initCharts();

  // 初始显示一组预测
  generatePrediction(1);
});

function switchType(type) {
  currentType = type;
  document.getElementById('predictionNumbers').innerHTML = '';
  document.getElementById('lotteryBalls').innerHTML = '';
  generatePrediction(1);
}

// 生成预测号码并显示
async function generatePrediction(count) {
  if (!userVip && count > 1) {
    alert('🔒 多组预测为VIP专属功能，请升级会员');
    return;
  }
  const predictions = [];
  for (let i = 0; i < count; i++) {
    const nums = randomNumbers(currentType);
    const { score, rating, confidence } = aiScore(nums, currentType);
    predictions.push({ numbers: nums, score, rating, confidence });
  }
  displayPredictions(predictions, 'predictionNumbers');
  
  // 保存到数据库（如果已登录）
  if (supabase) {
    const user = await getCurrentUser();
    if (user) {
      await supabase.from('predictions').insert(
        predictions.map(p => ({
          user_id: user.id,
          lottery_type: currentType,
          numbers: p.numbers,
          score: p.score,
          rating: p.rating
        }))
      );
    }
  }
}

// 显示预测结果（带滚动动画）
function displayPredictions(predictions, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  predictions.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'prediction-row';
    row.style.marginBottom = '10px';
    row.innerHTML = `
      <span style="color:var(--text-secondary);">预测${idx+1}: </span>
      <span id="nums-${idx}"></span>
      <span style="color:var(--green); margin-left:10px;">评分:${p.score} | ${p.rating}</span>
    `;
    container.appendChild(row);
    // 滚动动画：所有号码（前区+后区）逐个出现
    const allNums = [...p.numbers.front, ...p.numbers.back];
    setTimeout(() => {
      animateNumberScroll(`nums-${idx}`, allNums, 400);
    }, idx * 1200);
  });
}

// 摇奖机动画
async function startLotteryDraw() {
  const container = document.getElementById('lotteryBalls');
  container.innerHTML = '';
  const rule = currentType === 'dlt' ? DLT_RULE : SSQ_RULE;
  const frontNums = randomNumbers(currentType).front;
  const backNums = randomNumbers(currentType).back;
  
  // 前区滚动
  await animateBallScroll(container, frontNums, 'ball', 350);
  
  // 分隔符
  const sep = document.createElement('span');
  sep.style.margin = '0 15px';
  sep.textContent = '|';
  container.appendChild(sep);
  
  // 后区滚动
  await animateBallScroll(container, backNums, 'ball red', 350);
}

// 蒙特卡洛模拟（简化演示）
function runMonteCarlo() {
  const times = 1000;
  const freq = {};
  for (let i = 0; i < times; i++) {
    const nums = randomNumbers(currentType);
    [...nums.front, ...nums.back].forEach(n => {
      freq[n] = (freq[n] || 0) + 1;
    });
  }
  const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 10);
  alert('蒙特卡洛模拟TOP10号码：\n' + sorted.map(([num, count]) => `号码${num}: ${count}次`).join('\n'));
}

// 收藏当前预测
async function saveCurrentPrediction() {
  const container = document.getElementById('predictionNumbers');
  const numsText = container.innerText;
  if (!numsText) return alert('请先生成预测号码');
  // 简单解析（实际需从状态获取）
  alert('✅ 号码已收藏（需实现具体解析）');
}

// 管理员导入开奖数据（示例）
async function importDrawData() {
  if (userRole !== 'admin') return alert('仅管理员可操作');
  const issue = prompt('输入期号（如2024001）');
  const date = prompt('输入开奖日期（YYYY-MM-DD）');
  const frontStr = prompt('输入前区号码（空格分隔）');
  const backStr = prompt('输入后区号码（空格分隔）');
  if (!issue || !date || !frontStr || !backStr) return;
  const front = frontStr.split(' ').map(Number);
  const back = backStr.split(' ').map(Number);
  if (supabase) {
    const { error } = await supabase.from('draw_history').insert({
      lottery_type: currentType,
      issue,
      draw_date: date,
      front_numbers: front,
      back_numbers: back
    });
    if (error) alert('导入失败：' + error.message);
    else alert('✅ 开奖数据导入成功');
  } else {
    alert('演示模式：数据未保存到数据库');
  }
}

// 粒子背景初始化（与auth页面相同）
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 2.5 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.6;
      this.speedY = (Math.random() - 0.5) * 0.6;
      this.opacity = Math.random() * 0.7 + 0.3;
      this.color = ['#00F5FF','#6E00FF','#00FF9D','#ffffff'][Math.floor(Math.random()*4)];
      this.life = Math.random()*300+200;
      this.maxLife = this.life;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      const dx = mouseX - this.x;
      const dy = mouseY - this.y;
      const dist = Math.sqrt(dx*dx+dy*dy);
      if (dist < 200) {
        const force = (200-dist)/200*0.04;
        this.speedX += dx/dist*force;
        this.speedY += dy/dist*force;
      }
      this.speedX *= 0.998;
      this.speedY *= 0.998;
      this.life--;
      if (this.life <=0 || this.x<-20 || this.x>canvas.width+20 || this.y<-20 || this.y>canvas.height+20) {
        this.reset();
        this.x = Math.random()*canvas.width;
        this.y = Math.random()*canvas.height;
        this.life = this.maxLife;
      }
    }
    draw() {
      const alpha = (this.life/this.maxLife)*this.opacity;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size*2.5, 0, Math.PI*2);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = alpha*0.15;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  for (let i=0; i<120; i++) particles.push(new Particle());

  function animate() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    for (let i=0; i<particles.length; i++) {
      for (let j=i+1; j<particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = 'rgba(0,245,255,0.08)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(animate);
  }
  animate();

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    const glow = document.getElementById('mouseGlow');
    if (glow) {
      glow.style.left = e.clientX + 'px';
      glow.style.top = e.clientY + 'px';
    }
  });
}