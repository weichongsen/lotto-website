// Supabase 项目配置 - 请替换为你的实际URL和anon key
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';

let supabase;
try {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('✅ Supabase 客户端已初始化');
} catch (e) {
  console.warn('⚠️ Supabase 未配置，运行在演示模式');
  supabase = null;
}

// 获取当前登录用户
async function getCurrentUser() {
  if (!supabase) {
    const local = localStorage.getItem('ai_lottery_user');
    return local ? JSON.parse(local) : null;
  }
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// 检查VIP状态
async function checkVipStatus() {
  const user = await getCurrentUser();
  if (!user || !supabase) return false;
  const { data } = await supabase
    .from('profiles')
    .select('is_vip')
    .eq('id', user.id)
    .single();
  return data?.is_vip || false;
}

// 检查管理员角色
async function checkAdminRole() {
  const user = await getCurrentUser();
  if (!user || !supabase) return false;
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  return data?.role === 'admin';
}