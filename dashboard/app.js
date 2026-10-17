// 数据看板：读取 index.js 输出的 JSON 记录数组，纯前端，不上传任何数据
const state = { records: [] };

const els = {
  file: document.getElementById('file'),
  drop: document.getElementById('drop'),
  source: document.getElementById('source'),
  stats: document.getElementById('stats'),
  rows: document.getElementById('rows'),
  empty: document.getElementById('empty'),
  search: document.getElementById('search'),
  platform: document.getElementById('platform'),
  note: document.getElementById('note'),
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// 接受两种格式：纯数组，或 { records: [...] }
function parseRecords(text) {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.records;
  if (!Array.isArray(arr)) throw new Error('JSON 中没有记录数组');
  return arr;
}

function loadText(text, name) {
  try {
    state.records = parseRecords(text);
    els.source.textContent = `已加载 ${name}（${state.records.length} 条）`;
    fillFilters();
    render();
  } catch (error) {
    els.source.textContent = `加载失败：${error.message}`;
  }
}

function fillFilters() {
  const platforms = [...new Set(state.records.map(r => r.platform).filter(Boolean))];
  els.platform.innerHTML = '<option value="">全部平台</option>' +
    platforms.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  const notes = [...new Set(state.records.map(r => r.noteId).filter(Boolean))];
  els.note.innerHTML = '<option value="">全部笔记</option>' +
    notes.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
}

function filtered() {
  const q = els.search.value.trim().toLowerCase();
  const p = els.platform.value;
  const n = els.note.value;
  return state.records.filter(r =>
    (!p || r.platform === p) &&
    (!n || r.noteId === n) &&
    (!q || `${r.user ?? ''} ${r.content ?? ''}`.toLowerCase().includes(q))
  );
}

function renderStats(all) {
  const comments = all.filter(r => r.level === 0).length;
  const replies = all.filter(r => r.level === 1).length;
  const gaps = all.filter(r => r.source === 'GAP' || r.type === 'gap').length;
  const authorReplied = all.filter(r => r.hasAuthorReply === true).length;
  const cards = [
    ['记录总数', all.length],
    ['母评论', comments],
    ['子评论', replies],
    ['作者回复过的母评论', authorReplied],
    ['断层标记', gaps],
  ];
  els.stats.innerHTML = cards.map(([label, value]) =>
    `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`
  ).join('');
}

function badge(value) {
  if (value === true) return '<span class="badge yes">是</span>';
  if (value === false) return '<span class="badge no">否</span>';
  return '<span class="badge">未知</span>';
}

function renderRows(list) {
  els.empty.hidden = list.length > 0;
  els.rows.innerHTML = list.map(r => {
    const isGap = r.source === 'GAP' || r.type === 'gap';
    if (isGap) {
      return `<tr><td colspan="8"><span class="badge gap">断层：此处缺帧，之后的回复不归属前面的母评论</span></td></tr>`;
    }
    const level = r.level === 1 ? '子评论' : r.level === 0 ? '母评论' : '未知';
    return `<tr class="${r.level === 1 ? 'reply' : ''}">
      <td>${esc(r.platform)}</td>
      <td title="${esc(r.sourceUrl ?? '')}">${esc(r.noteId ?? '')}</td>
      <td>${esc(r.user)}${r.isAuthor ? ' <span class="badge">作者</span>' : ''}</td>
      <td>${level}</td>
      <td>${esc(r.replyToUser ?? '')}</td>
      <td>${r.level === 0 ? badge(r.hasAuthorReply) : ''}</td>
      <td class="content">${esc(r.content)}</td>
      <td>${esc(r.firstSeen ?? '')}</td>
    </tr>`;
  }).join('');
}

function render() {
  renderStats(state.records);
  renderRows(filtered());
}

els.file.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) loadText(await file.text(), file.name);
});

['dragenter', 'dragover'].forEach(ev => els.drop.addEventListener(ev, e => {
  e.preventDefault();
  els.drop.classList.add('hover');
}));
['dragleave', 'drop'].forEach(ev => els.drop.addEventListener(ev, e => {
  e.preventDefault();
  els.drop.classList.remove('hover');
}));
els.drop.addEventListener('drop', async (e) => {
  const file = e.dataTransfer.files[0];
  if (file) loadText(await file.text(), file.name);
});

[els.search, els.platform, els.note].forEach(el => el.addEventListener('input', () => renderRows(filtered())));
