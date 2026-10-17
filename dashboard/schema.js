// 统一记录格式：所有来源都转换成这一种结构，看板只读这一种格式
// kind:   revenue（收入）| cost（成本）| monitor（监控）| review（用户评价）
// source: 数据来源标识，例如 app_store_connect、gmail_invoice、xiaohongshu、cloudflare
export const KINDS = ['revenue', 'cost', 'monitor', 'review'];

export const FIELDS = [
  { name: 'kind', required: true, desc: '记录类型，见 KINDS' },
  { name: 'source', required: true, desc: '数据来源' },
  { name: 'date', required: true, desc: 'YYYY-MM-DD，本地日期' },
  { name: 'amount', required: false, desc: '金额；收入净额，退款为负；仅 revenue/cost 使用' },
  { name: 'currency', required: false, desc: '币种代码，例如 USD、EUR、CNY' },
  { name: 'title', required: true, desc: '一行摘要' },
  { name: 'detail', required: false, desc: '详细内容，例如评论原文' },
  { name: 'ref', required: false, desc: '外部标识：订单号、发票号、评论 id' },
  { name: 'url', required: false, desc: '来源链接' },
];

// 基本校验：返回错误列表，空数组表示通过
export function validate(record) {
  const errors = [];
  for (const f of FIELDS) {
    if (f.required && (record[f.name] === undefined || record[f.name] === null || record[f.name] === '')) {
      errors.push(`缺少必填字段 ${f.name}`);
    }
  }
  if (record.kind && !KINDS.includes(record.kind)) errors.push(`未知 kind: ${record.kind}`);
  if (record.date && !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) errors.push(`date 格式应为 YYYY-MM-DD`);
  if ((record.kind === 'revenue' || record.kind === 'cost') && typeof record.amount !== 'number') {
    errors.push(`${record.kind} 记录需要数字类型的 amount`);
  }
  return errors;
}
