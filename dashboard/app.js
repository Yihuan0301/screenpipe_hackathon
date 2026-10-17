// 数据看板：纯前端。读取 JSON 或 Demo 数据，展示概览、数据库表和评论
import { KINDS, FIELDS, validate } from './schema.js';

const state = { records: [], comments: [] };
const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// 接受纯数组，或 { records: [...] }
function parseRecords(text) {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.records;
  if (!Array.isArray(arr)) throw new Error('JSON 中没有记录数组');
  return arr;
}

// 统一格式的记录 vs 旧版评论记录（有 level/user 字段）分开处理
function splitRecords(arr) {
  const unified = [];
  const comments = [];
  for (const r of arr) {
    if (r && r.kind && KINDS.includes(r.kind)) unified.push(r);
    else if (r && (r.level !== undefined || r.user !== undefined)) comments.push(r);
  }
  return { unified, comments };
}

function load(arr, name) {
  const { unified, comments } = splitRecords(arr);
  state.records = unified;
  state.comments = comments;
  const invalid = unified.filter(r => validate(r).length).length;
  $('source').textContent = `已加载 ${name}：${unified.length} 条统一记录，${comments.length} 条评论` +
    (invalid ? `，${invalid} 条格式有问题` : '');
  fillFilters();
  renderAll();
}

function fillFilters() {
  const kinds = [...new Set(state.records.map(r => r.kind))];
  $('db-kind').innerHTML = '<option value="">全部类型</option>' +
    kinds.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  const sources = [...new Set(state.records.map(r => r.source))];
  $('db-source').innerHTML = '<option value="">全部来源</option>' +
    sources.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const platforms = [...new Set(state.comments.map(r => r.platform).filter(Boolean))];
  $('platform').innerHTML = '<option value="">全部平台</option>' +
    platforms.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  const notes = [...new Set(state.comments.map(r => r.noteId).filter(Boolean))];
  $('note').innerHTML = '<option value="">全部笔记</option>' +
    notes.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
}

// ---- 概览 ----
function renderOverview() {
  const count = (k) => state.records.filter(r => r.kind === k).length;
  const kpis = [
    ['收入记录', count('revenue')],
    ['成本记录', count('cost')],
    ['监控事件', count('monitor')],
    ['用户评价', count('review')],
  ];
  $('kpis').innerHTML = kpis.map(([label, value]) =>
    `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`
  ).join('');

  // 金额按类型和币种汇总；不做跨币种换算
  const byKind = {};
  for (const r of state.records) {
    if (typeof r.amount !== 'number') continue;
    const key = `${r.kind}|${r.currency || '未知币种'}`;
    byKind[key] = (byKind[key] || 0) + r.amount;
  }
  const rows = KINDS.map(k => {
    const n = count(k);
    const amounts = Object.entries(byKind)
      .filter(([key]) => key.startsWith(k + '|'))
      .map(([key, sum]) => `${sum.toFixed(2)} ${key.split('|')[1]}`)
      .join('，') || '—';
    return `<tr><td>${esc(k)}</td><td>${n}</td><td>${esc(amounts)}</td></tr>`;
  });
  $('summary').innerHTML = rows.join('');
}

// ---- 数据库：原始表格 ----
function renderDatabase() {
  const kind = $('db-kind').value;
  const source = $('db-source').value;
  const q = $('db-search').value.trim().toLowerCase();
  const list = state.records.filter(r =>
    (!kind || r.kind === kind) &&
    (!source || r.source === source) &&
    (!q || `${r.title ?? ''} ${r.detail ?? ''} ${r.ref ?? ''}`.toLowerCase().includes(q))
  );
  $('db-rows').innerHTML = list.map(r => `<tr>
    <td>${esc(r.kind)}</td><td>${esc(r.source)}</td><td>${esc(r.date)}</td>
    <td class="num">${r.amount === undefined ? '' : esc(r.amount.toFixed ? r.amount.toFixed(2) : r.amount)}</td>
    <td>${esc(r.currency ?? '')}</td><td>${esc(r.title)}</td><td class="content">${esc(r.detail ?? '')}</td>
    <td>${esc(r.ref ?? '')}</td><td>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">链接</a>` : ''}</td>
  </tr>`).join('');
  $('db-count').textContent = `显示 ${list.length} / ${state.records.length} 条`;
}

// ---- 评论（旧版小红书记录） ----
function renderComments() {
  const q = $('search').value.trim().toLowerCase();
  const p = $('platform').value;
  const n = $('note').value;
  const list = state.comments.filter(r =>
    (!p || r.platform === p) && (!n || r.noteId === n) &&
    (!q || `${r.user ?? ''} ${r.content ?? r.text ?? ''}`.toLowerCase().includes(q))
  );
  $('rows').innerHTML = list.map(r => {
    const level = r.level === 1 ? '子评论' : r.level === 0 ? '母评论' : '未知';
    const reply = r.hasAuthorReply === true ? '<span class="badge yes">是</span>'
      : r.hasAuthorReply === false ? '<span class="badge no">否</span>' : '<span class="badge">未知</span>';
    return `<tr class="${r.level === 1 ? 'reply' : ''}">
      <td>${esc(r.platform)}</td><td>${esc(r.noteId ?? '')}</td><td>${esc(r.user)}</td>
      <td>${level}</td><td>${esc(r.replyToUser ?? '')}</td>
      <td>${r.level === 0 ? reply : ''}</td>
      <td class="content">${esc(r.content ?? r.text ?? '')}</td><td>${esc(r.firstSeen ?? '')}</td>
    </tr>`;
  }).join('');
}

// ---- 格式说明 ----
function renderSchema() {
  $('schema-rows').innerHTML = FIELDS.map(f =>
    `<tr><td>${esc(f.name)}</td><td>${f.required ? '是' : '否'}</td><td>${esc(f.desc)}</td></tr>`
  ).join('');
}

function renderAll() {
  renderOverview();
  renderDatabase();
  renderComments();
}

// ---- 事件 ----
document.querySelectorAll('.tabs button').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('[data-panel]').forEach(s => { s.hidden = s.dataset.panel !== btn.dataset.tab; });
}));


['db-kind', 'db-source'].forEach(id => $(id).addEventListener('input', renderDatabase));
$('db-search').addEventListener('input', renderDatabase);
['search', 'platform', 'note'].forEach(id => $(id).addEventListener('input', renderComments));

renderSchema();

// ---- 自动读取 screenpipe 收集结果（不需要手动导入） ----
// collect.js 把抓取结果写到 ../data/xiaohongshu-comments.json；页面每 30 秒重新读取。
const DATA_URL = "../data/xiaohongshu-comments.json";
const REFRESH_MS = 30_000;

async function refresh() {
  try {
    const res = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (data.records || []);
    const updated = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("zh-CN") : "未知";
    load(arr, "screenpipe 数据（更新于 " + updated + "）");
  } catch (err) {
    $("source").textContent = "尚未有数据：" + err.message + "（先运行 collect.js）";
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
