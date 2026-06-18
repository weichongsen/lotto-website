// 彩票规则定义
const DLT_RULE = {
  front: { min: 1, max: 35, count: 5 },
  back: { min: 1, max: 12, count: 2 }
};
const SSQ_RULE = {
  front: { min: 1, max: 33, count: 6 },
  back: { min: 1, max: 16, count: 1 }
};

// 随机生成一注号码
function randomNumbers(type) {
  const rule = type === 'dlt' ? DLT_RULE : SSQ_RULE;
  const front = [];
  while (front.length < rule.front.count) {
    const n = Math.floor(Math.random() * rule.front.max) + 1;
    if (!front.includes(n)) front.push(n);
  }
  const back = [];
  while (back.length < rule.back.count) {
    const n = Math.floor(Math.random() * rule.back.max) + 1;
    if (!back.includes(n)) back.push(n);
  }
  return { front: front.sort((a,b)=>a-b), back: back.sort((a,b)=>a-b) };
}

// AI综合评分（模拟多维分析）
function aiScore(numbers, type) {
  // 此处可接入真实统计算法，目前使用模拟数据
  let score = 72 + Math.floor(Math.random() * 23);
  if (type === 'dlt') score += 2;
  let rating;
  if (score >= 96) rating = 'SSS';
  else if (score >= 90) rating = 'SS';
  else if (score >= 85) rating = 'S';
  else if (score >= 80) rating = 'A';
  else rating = 'B';
  return {
    score: score,
    rating: rating,
    confidence: Math.min(98, score + Math.floor(Math.random() * 3))
  };
}

// 滚动号码动画（核心效果：逐个滚动后定格）
function animateNumberScroll(containerId, numbers, delayBetween = 500) {
  return new Promise(resolve => {
    const container = document.getElementById(containerId);
    if (!container) { resolve(); return; }
    container.innerHTML = '';
    let idx = 0;
    function showNext() {
      if (idx >= numbers.length) { resolve(); return; }
      const num = numbers[idx];
      const scrollDiv = document.createElement('div');
      scrollDiv.className = 'scroll-number';
      const list = document.createElement('div');
      list.className = 'digit-list';
      
      // 生成随机滚动序列（0-9打乱后加上目标数字）
      const digits = [];
      for (let i = 0; i < 10; i++) digits.push(i);
      for (let i = digits.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [digits[i], digits[j]] = [digits[j], digits[i]];
      }
      digits.push(num); // 确保最后显示目标数字
      list.innerHTML = digits.map(d => `<div class="digit-item">${d}</div>`).join('');
      scrollDiv.appendChild(list);
      container.appendChild(scrollDiv);
      
      // 触发滚动动画
      setTimeout(() => {
        list.style.transform = `translateY(-${(digits.length - 1) * 70}px)`;
      }, 30);
      
      idx++;
      setTimeout(showNext, delayBetween);
    }
    showNext();
  });
}

// 球形滚动动画（用于摇奖机）
function animateBallScroll(container, numbers, className, delay) {
  return new Promise(resolve => {
    let idx = 0;
    function next() {
      if (idx >= numbers.length) { resolve(); return; }
      const span = document.createElement('span');
      span.className = className;
      span.textContent = '?';
      container.appendChild(span);
      
      let counter = 0;
      const interval = setInterval(() => {
        span.textContent = Math.floor(Math.random() * 30) + 1;
        counter++;
        if (counter >= 8) {
          clearInterval(interval);
          span.textContent = numbers[idx];
          span.classList.add('settled');
          idx++;
          setTimeout(next, delay);
        }
      }, 80);
    }
    next();
  });
}