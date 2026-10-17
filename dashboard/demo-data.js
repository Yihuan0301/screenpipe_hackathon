// DEMO 数据：全部为虚构示例，用于演示页面，不代表任何真实收入、成本或评价
export const DEMO_RECORDS = [
  { kind: 'revenue', source: 'app_store_connect', date: '2026-10-10', amount: 38.97, currency: 'USD', title: '应用内购买（演示）', detail: '3 笔订阅', ref: 'DEMO-R-001' },
  { kind: 'revenue', source: 'app_store_connect', date: '2026-10-11', amount: -4.99, currency: 'USD', title: '退款（演示）', detail: '1 笔退款', ref: 'DEMO-R-002' },
  { kind: 'revenue', source: 'app_store_connect', date: '2026-10-12', amount: 24.98, currency: 'USD', title: '应用内购买（演示）', detail: '2 笔订阅', ref: 'DEMO-R-003' },
  { kind: 'cost', source: 'gmail_invoice', date: '2026-10-01', amount: 20.00, currency: 'USD', title: '云服务月费（演示）', detail: '示例供应商 A', ref: 'DEMO-INV-1001' },
  { kind: 'cost', source: 'gmail_invoice', date: '2026-10-05', amount: 9.90, currency: 'EUR', title: '域名续费（演示）', detail: '示例供应商 B', ref: 'DEMO-INV-1002' },
  { kind: 'monitor', source: 'cloudflare', date: '2026-10-12', title: '请求量异常升高（演示）', detail: '相比前一日增加 3 倍', ref: 'DEMO-MON-01' },
  { kind: 'monitor', source: 'fly_io', date: '2026-10-13', title: '实例重启（演示）', detail: '1 次健康检查失败', ref: 'DEMO-MON-02' },
  { kind: 'review', source: 'xiaohongshu', date: '2026-10-14', title: '用户评价（演示）', detail: '这个功能很好用，希望能出安卓版', ref: 'DEMO-REV-01', url: 'https://www.xiaohongshu.com/explore/demo1' },
  { kind: 'review', source: 'xiaohongshu', date: '2026-10-15', title: '用户评价（演示）', detail: '请问支持英文吗？', ref: 'DEMO-REV-02', url: 'https://www.xiaohongshu.com/explore/demo1' },
];
