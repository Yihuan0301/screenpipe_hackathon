// 运营看板：概览卡片显示重点数字，点"明细"进入原始表格（用于验证）。纯前端，数据不上传。
import { KINDS, FIELDS, validate } from './schema.js';
import { DEMO_RECORDS } from './demo-data.js';

const state = { records: [], comments: [], view: 'overview' };
const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function parseRecords(text) {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.records;
  if (!Array.isArray(arr)) throw new Error('JSON 中没有记录数组');
  return arr;
}

function splitRecords(arr) {
  const unified = [];
  const comments = [];
  for (const r of arr) {
    if (r && r.kind && KINDS.includes(r.kind)) unified.push(r);
    else if (r && (r.level !== undefined || r.user !== undefined)) comments.push(r);
  }
  return { unified, comments };
}

// 时间范围：按 date 字段截取最近 N 天（以今天为基准，本地日期）
function inRange(r) {
  const days = $('range').value;
  if (days === 'all' || !r.date) return true;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(days));
  return new Date(r.date) >= cutoff;
}

function current() {
  return state.records.filter(inRange);
}

function load(arr, name) {
  const { unified, comments } = splitRecords(arr);
  state.records = unified;
  state.comments = comments;
  const invalid = unified.filter(r => validate(r).length).length;
  $('status').textContent = `${name}：${unified.length} 条统一记录，${comments.length} 条评论` +
    (invalid ? `，${invalid} 条格式有问题` : '');
  render();
}

// 金额按币种汇总，不做跨币种换算
function sumByCurrency(list) {
  const out = {};
  for (const r of list) {
    if (typeof r.amount !== 'number') continue;
    const c = r.currency || '未知';
    out[c] = (out[c] || 0) + r.amount;
  }
  return Object.entries(out).map(([c, v]) => `${v.toFixed(2)} ${c}`).join(' / ') || '—';
}

// 概览卡片：每张卡一个重点数字，颜色块风格
function renderOverview() {
  const list = current();
  const of = (k) => list.filter(r => r.kind === k);
  const revenue = of('revenue');
  const cost = of('cost');
  const monitor = of('monitor');
  const review = of('review');
  const cards = [
    { cls: 'c-red', label: '收入', big: sumByCurrency(revenue), money: true, sub: `${revenue.length} 笔（退款已计为负数）`, kind: 'revenue' },
    { cls: 'c-black', label: '成本', big: sumByCurrency(cost), money: true, sub: `${cost.length} 张发票`, kind: 'cost' },
    { cls: 'c-yellow', label: '监控事件', big: monitor.length, sub: '来自各平台的告警与变化', kind: 'monitor' },
    { cls: 'c-blue', label: '用户评价', big: review.length, sub: '来自社交平台的评价', kind: 'review' },
    { cls: 'c-sky', label: '记录总数', big: list.length, sub: '所有来源合计', kind: 'all' },
    { cls: 'c-pink', label: '评论记录', big: state.comments.length, sub: '抓取到的原始评论', kind: 'comments' },
  ];
  $('overview').innerHTML = cards.map(c => `
    <div class="card ${c.cls}">
      <div class="label">${esc(c.label)}</div>
      <div class="big${c.money ? ' money' : ''}">${esc(c.big)}</div>
      <div class="sub">${esc(c.sub)}</div>
      <button class="btn" data-detail="${c.kind}">明细</button>
    </div>`).join('');
}

// 明细页：原始表格（与概览同一份数据）
function showDetail(kind) {
  const titles = {
    revenue: '收入明细', cost: '成本明细', monitor: '监控明细',
    review: '用户评价明细', all: '全部记录', comments: '评论明细',
  };
  const list = kind === 'all' ? current()
    : kind === 'comments' ? [] : current().filter(r => r.kind === kind);
  $('detail-title').textContent = titles[kind] || '明细';
  $('detail-rows').innerHTML = list.map(detailRow).join('');
  $('detail-count').textContent = `显示 ${list.length} 条`;
  $('comments-block').hidden = kind !== 'comments' && kind !== 'review';
  $('comment-rows').innerHTML = (kind === 'comments' || kind === 'review')
    ? state.comments.map(commentRow).join('') : '';
  $('overview').hidden = true;
  $('drop').hidden = true;
  $('detail').hidden = false;
  $('schema').hidden = true;
  state.view = kind;
  window.scrollTo(0, 0);
}

function detailRow(r) {
  const link = r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">打开</a>` : '';
  const amount = typeof r.amount === 'number' ? r.amount.toFixed(2) : '';
  return `<tr>
    <td>${esc(r.kind)}</td><td>${esc(r.source)}</td><td>${esc(r.date)}</td>
    <td class="num">${esc(amount)}</td><td>${esc(r.currency ?? '')}</td>
    <td>${esc(r.title)}</td><td class="content">${esc(r.detail ?? '')}</td>
    <td>${esc(r.ref ?? '')}</td><td>${link}</td>
  </tr>`;
}

function commentRow(r) {
  const level = r.level === 1 ? '子评论' : r.level === 0 ? '母评论' : '未知';
  const reply = r.hasAuthorReply === true ? '<span class="badge yes">是</span>'
    : r.hasAuthorReply === false ? '<span class="badge no">否</span>' : '<span class="badge">未知</span>';
  return `<tr class="${r.level === 1 ? 'reply' : ''}">
    <td>${esc(r.platform)}</td><td>${esc(r.noteId ?? '')}</td><td>${esc(r.user)}</td>
    <td>${level}</td><td>${esc(r.replyToUser ?? '')}</td>
    <td>${r.level === 0 ? reply : ''}</td>
    <td class="content">${esc(r.content ?? r.text ?? '')}</td><td>${esc(r.firstSeen ?? '')}</td>
  </tr>`;
}

function showOverview() {
  $('detail').hidden = true;
  $('schema').hidden = true;
  $('overview').hidden = false;
  $('drop').hidden = false;
  state.view = 'overview';
}

function showSchema() {
  $('schema-rows').innerHTML = FIELDS.map(f =>
    `<tr><td>${esc(f.name)}</td><td>${f.required ? '是' : '否'}</td><td>${esc(f.desc)}</td></tr>`
  ).join('');
  $('overview').hidden = true;
  $('detail').hidden = true;
  $('drop').hidden = true;
  $('schema').hidden = false;
}

function render() {
  if (state.view === 'overview') renderOverview();
  else if (state.view === 'schema') showSchema();
  else showDetail(state.view);
}

// ---- 事件 ----
$('overview').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-detail]');
  if (btn) showDetail(btn.dataset.detail);
});
$('back').addEventListener('click', showOverview);
$('range').addEventListener('change', render);
$('file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) load(parseRecords(await file.text()), file.name);
});
$('demo-btn').addEventListener('click', () => load(DEMO_RECORDS, 'Demo 数据（虚构）'));

['dragenter', 'dragover'].forEach(ev => $('drop').addEventListener(ev, e => {
  e.preventDefault();
  $('drop').classList.add('hover');
}));
['dragleave', 'drop'].forEach(ev => $('drop').addEventListener(ev, e => {
  e.preventDefault();
  $('drop').classList.remove('hover');
}));
$('drop').addEventListener('drop', async (e) => {
  const file = e.dataTransfer.files[0];
  if (file) load(parseRecords(await file.text()), file.name);
});

$('detail-search').addEventListener('input', () => {
  const q = $('detail-search').value.trim().toLowerCase();
  document.querySelectorAll('#detail-rows tr').forEach(tr => {
    tr.hidden = q && !tr.textContent.toLowerCase().includes(q);
  });
});

renderOverview();
