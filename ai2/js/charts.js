// 初始化所有图表（深色科技主题）
function initCharts() {
  const chartTheme = {
    backgroundColor: 'transparent',
    textStyle: { color: '#e0e0e0' },
    title: { textStyle: { color: '#00F5FF' } },
    legend: { textStyle: { color: '#a0a0b8' } }
  };

  // 热号趋势图
  const hotChartEl = document.getElementById('hotChart');
  if (hotChartEl) {
    const hotChart = echarts.init(hotChartEl);
    hotChart.setOption({
      ...chartTheme,
      title: { text: '热号趋势', left: 'center' },
      tooltip: { trigger: 'axis' },
      xAxis: { data: Array.from({length:20}, (_,i)=>`期${i+1}`), axisLine: { lineStyle: { color: '#333' } } },
      yAxis: { axisLine: { lineStyle: { color: '#333' } } },
      series: [{
        type: 'line',
        data: Array.from({length:20}, ()=>Math.floor(Math.random()*10)+1),
        lineStyle: { color: '#00F5FF', width: 2 },
        itemStyle: { color: '#00F5FF' },
        areaStyle: { color: 'rgba(0,245,255,0.15)' }
      }]
    });
  }

  // 奇偶比例图
  const oddEvenEl = document.getElementById('oddEvenChart');
  if (oddEvenEl) {
    const oeChart = echarts.init(oddEvenEl);
    oeChart.setOption({
      ...chartTheme,
      title: { text: '奇偶比例', left: 'center' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        data: [
          { value: 55, name: '奇数', itemStyle: { color: '#00F5FF' } },
          { value: 45, name: '偶数', itemStyle: { color: '#6E00FF' } }
        ],
        label: { color: '#e0e0e0' }
      }]
    });
  }

  // 和值走势图
  const sumChartEl = document.getElementById('sumChart');
  if (sumChartEl) {
    const sumChart = echarts.init(sumChartEl);
    sumChart.setOption({
      ...chartTheme,
      title: { text: '和值走势', left: 'center' },
      xAxis: { data: [...Array(15).keys()].map(i=>`期${i+1}`), axisLine: { lineStyle: { color: '#333' } } },
      yAxis: { axisLine: { lineStyle: { color: '#333' } } },
      series: [{
        type: 'bar',
        data: Array.from({length:15}, ()=> Math.floor(Math.random()*60)+60),
        itemStyle: { color: '#00FF9D' }
      }]
    });
  }

  // AI评分走势
  const scoreChartEl = document.getElementById('scoreChart');
  if (scoreChartEl) {
    const scoreChart = echarts.init(scoreChartEl);
    scoreChart.setOption({
      ...chartTheme,
      title: { text: 'AI评分趋势', left: 'center' },
      xAxis: { data: ['周一','周二','周三','周四','周五','周六','周日'], axisLine: { lineStyle: { color: '#333' } } },
      yAxis: { axisLine: { lineStyle: { color: '#333' } } },
      series: [{
        type: 'line',
        data: [87, 90, 93, 88, 95, 91, 89],
        lineStyle: { color: '#FFD700', width: 2 },
        itemStyle: { color: '#FFD700' }
      }]
    });
  }
}