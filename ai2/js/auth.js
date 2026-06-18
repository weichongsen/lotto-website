// 登录注册页面交互逻辑
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const toggleBtn = document.getElementById('toggleBtn');
  const toggleText = document.getElementById('toggleText');
  let isLogin = true;

  // 切换表单
  toggleBtn.addEventListener('click', () => {
    isLogin = !isLogin;
    if (isLogin) {
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
      toggleText.innerHTML = '还没有账户？ <span id="toggleBtn">立即注册</span>';
    } else {
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
      toggleText.innerHTML = '已有账户？ <span id="toggleBtn">立即登录</span>';
    }
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('regError').style.display = 'none';
    document.getElementById('regSuccess').style.display = 'none';
  });

  // 登录提交
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    errorEl.style.display = 'none';

    if (!supabase) {
      // 演示模式：直接存储用户信息并跳转
      localStorage.setItem('ai_lottery_user', JSON.stringify({
        email: email,
        username: email.split('@')[0],
        is_vip: email.includes('vip'),
        role: email.includes('admin') ? 'admin' : 'user',
        login_time: new Date().toISOString()
      }));
      window.location.href = 'index.html';
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = '❌ 登录失败：' + (error.message === 'Invalid login credentials' ? '邮箱或密码错误' : error.message);
      errorEl.style.display = 'block';
    } else {
      window.location.href = 'index.html';
    }
  });

  // 注册提交
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const errorEl = document.getElementById('regError');
    const successEl = document.getElementById('regSuccess');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    if (!supabase) {
      successEl.textContent = '✅ 演示模式：账户已创建，请登录';
      successEl.style.display = 'block';
      setTimeout(() => {
        isLogin = true;
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        toggleText.innerHTML = '还没有账户？ <span id="toggleBtn">立即注册</span>';
        document.getElementById('loginEmail').value = email;
      }, 1500);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });
    if (error) {
      errorEl.textContent = '❌ ' + (error.message.includes('already') ? '该邮箱已注册' : error.message);
      errorEl.style.display = 'block';
    } else {
      successEl.textContent = '✅ 注册成功！请查收验证邮件，然后登录';
      successEl.style.display = 'block';
      if (data.user) {
        await supabase.from('profiles').insert({ id: data.user.id, username, email });
      }
      setTimeout(() => {
        isLogin = true;
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        toggleText.innerHTML = '还没有账户？ <span id="toggleBtn">立即注册</span>';
        document.getElementById('loginEmail').value = email;
      }, 2000);
    }
  });
});