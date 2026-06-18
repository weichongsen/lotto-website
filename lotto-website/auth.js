// ==================== Supabase 配置（务必修改） ====================
const SUPABASE_URL = 'https://qwvrojfdripeswuocgpo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5c2rAccL-qR_QX7iAiQXiw_IdCVF_a4';
// =================================================================

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isLoginMode = true;
let otpTimer = null;

// 粒子背景（简化版）
(function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];
  function resize() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize); resize();
  for (let i = 0; i < 90; i++) particles.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, r: Math.random() * 2 + 1 });
  (function anim() { ctx.clearRect(0, 0, w, h); particles.forEach(p => { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = '#00F5FF'; ctx.shadowBlur = 12; ctx.fill(); }); requestAnimationFrame(anim); })();
})();

// 切换登录/注册
window.toggleAuthMode = () => {
  isLoginMode = !isLoginMode;
  document.getElementById('auth-title').textContent = isLoginMode ? '🔐 登录' : '📝 注册';
  document.getElementById('auth-username').style.display = isLoginMode ? 'none' : 'block';
  document.getElementById('otp-section').style.display = isLoginMode ? 'none' : 'block';
  document.getElementById('auth-submit').textContent = isLoginMode ? '登 录' : '注 册';
  document.getElementById('toggle-auth').textContent = isLoginMode ? '还没有账号？立即注册' : '已有账号？去登录';
  if (otpTimer) clearInterval(otpTimer);
  document.getElementById('send-otp-btn').disabled = false;
  document.getElementById('send-otp-btn').textContent = '获取验证码';
};

// 发送验证码
window.sendOTP = async () => {
  const email = document.getElementById('auth-email').value.trim();
  if (!email) return alert('请输入邮箱');
  const btn = document.getElementById('send-otp-btn');
  btn.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw error;
    alert('验证码已发送至 ' + email);
    let sec = 60;
    btn.textContent = sec + 's';
    otpTimer = setInterval(() => {
      sec--;
      btn.textContent = sec + 's';
      if (sec <= 0) { clearInterval(otpTimer); btn.disabled = false; btn.textContent = '重新发送'; }
    }, 1000);
  } catch (err) {
    alert('发送失败: ' + err.message);
    btn.disabled = false;
  }
};

// 登录/注册处理
window.handleAuth = async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) return alert('请填写邮箱和密码');

  if (isLoginMode) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert('登录失败: ' + error.message);
    // 登录成功，保存凭证并跳转
    localStorage.setItem('supabase_session', JSON.stringify(data.session));
    window.location.href = 'index.html';
  } else {
    const username = document.getElementById('auth-username').value.trim();
    const otp = document.getElementById('auth-otp').value.trim();
    if (!username) return alert('请填写用户名');
    if (!otp) return alert('请输入验证码');

    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (verifyError) return alert('验证码错误: ' + verifyError.message);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
    if (signUpError) return alert('注册失败: ' + signUpError.message);

    if (signUpData.user) {
      await supabase.from('profiles').insert({ id: signUpData.user.id, username });
      alert('注册成功！');
      // 注册后自动登录并跳转
      const { data } = await supabase.auth.signInWithPassword({ email, password });
      if (data.session) {
        localStorage.setItem('supabase_session', JSON.stringify(data.session));
        window.location.href = 'index.html';
      }
    }
  }
};

// 快速登录（管理员）
window.quickLogin = async () => {
  const email = 'admin@admin.com';
  const password = 'admin123';
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { alert('快速登录失败: ' + error.message); return; }
  localStorage.setItem('supabase_session', JSON.stringify(data.session));
  window.location.href = 'index.html';
};
