// ---------- 45 秒版新增場景（由 build-long.py 併入 promo-long.html） ----------
const SLOTS = { s1: [0, 6], s2: [6, 13], s3: [13, 20], s4: [20, 27], s5: [27, 34.5], s6: [34.5, 42], outro: 42 };
const typed = (s, p) => s.slice(0, Math.floor(clamp(p) * s.length));
function windowFrame(x, y, w, h, title, sub, { alpha = 1 } = {}) {
  drawPanel(x, y, w, h, { alpha });
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.fillStyle = 'rgba(255,255,255,0.03)'; rr(x, y, w, 56, [20, 20, 0, 0]); ctx.fill();
  ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(x, y + 56); ctx.lineTo(x + w, y + 56); ctx.stroke();
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.beginPath(); ctx.arc(x + 26 + i * 20, y + 28, 5.5, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); });
  text(title, x + 96, y + 35, { size: 19, weight: 700 }); if (sub) text(sub, x + 96 + measure(title, 19, 700) + 14, y + 35, { size: 14, color: C.muted, weight: 500 });
  ctx.restore();
}
function cursor(x, y, { alpha = 1, press = false } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); const s = press ? 0.85 : 1; ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 24); ctx.lineTo(6, 18); ctx.lineTo(10, 27); ctx.lineTo(14, 25); ctx.lineTo(10, 16); ctx.lineTo(18, 16); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
}
function badge(label, x, y, color, { alpha = 1, size = 13 } = {}) { return pill(label, x, y, { bg: rgba(color, 0.18), fg: color, size, h: 24, padX: 9, alpha }); }
function msgBubble(kind, who, body, x, y, w, { alpha = 1 } = {}) {
  // kind：user（accent 底＋accent 左框）、progress（灰字、虛線左框）、agent（hover 底）
  const h = 58; ctx.save(); ctx.globalAlpha *= alpha;
  rr(x, y, w, h, [0, 10, 10, 0]); ctx.fillStyle = kind === 'user' ? rgba(C.accent, 0.16) : kind === 'agent' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 1.5, y); ctx.lineTo(x + 1.5, y + h); ctx.lineWidth = 3; ctx.strokeStyle = kind === 'user' ? C.accent : kind === 'agent' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.3)'; if (kind === 'progress') ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
  text(who, x + 16, y + 20, { size: 12, weight: 700, color: kind === 'user' ? '#7cc0ff' : C.muted });
  text(body, x + 16, y + 44, { size: 16, color: kind === 'progress' ? C.muted : C.ink });
  ctx.restore(); return h;
}

// ---------- 場景 S2：Claude Code Session 自動同步成卡片（7s） ----------
function sceneSync(t0, len) {
  const enter = seg(t0, 0, 0.6), leave = seg(t0, len - 0.4, len, ease.in);
  ctx.save(); ctx.globalAlpha = enter * (1 - leave);
  const sc = lerp(0.96, 1, enter) * lerp(1, 1.08, leave); ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
  // 左：Claude App 視窗
  const ax = 90, ay = 130, aw = 780, ah = 790;
  windowFrame(ax, ay, aw, ah, 'Claude', 'Code');
  const sbW = 230; ctx.fillStyle = 'rgba(255,255,255,0.025)'; rr(ax, ay + 56, sbW, ah - 56, [0, 0, 0, 20]); ctx.fill();
  text('Sessions', ax + 20, ay + 92, { size: 13, weight: 700, color: C.muted, ls: 1 });
  const titleP = seg(t0, 4.2, 4.6);
  const sessions = [[titleP > 0.5 ? 'CSS 變數與深色模式' : '請把 index.html 的色彩改為…', true], ['修正排程重試邏輯', false], ['整理 README 安裝說明', false], ['Claude session 同步', false]];
  sessions.forEach(([s, on], i) => { const y = ay + 112 + i * 46; if (on) { rr(ax + 10, y, sbW - 20, 38, 8); ctx.fillStyle = rgba(C.orange, 0.16); ctx.fill(); } text(clipLine(s, 16), ax + 24, y + 25, { size: 15, weight: on ? 700 : 500, color: on ? C.ink : C.muted }); });
  if (titleP > 0) { ctx.save(); ctx.globalAlpha *= titleP * (1 - seg(t0, 6.0, 6.4)); badge('App 已命名 session', ax + 14, ay + 300, C.orange); ctx.restore(); }
  // 聊天區
  const cx = ax + sbW + 26, cw = aw - sbW - 52;
  const prompt = '請把 index.html 的色彩改為 CSS 變數，並支援深色模式。';
  const tp = seg(t0, 0.5, 1.3, p => p); if (tp > 0) { const w = cw - 60; rr(cx + 60, ay + 80, w, 64, 14); ctx.fillStyle = rgba(C.accent, 0.2); ctx.fill(); text(typed(prompt, tp), cx + 80, ay + 118, { size: 17 }); text('你', cx + 60 + w, ay + 164, { size: 12, color: C.muted, align: 'right' }); }
  const progress = [['讀取 outputs/taskboard/index.html', 1.8], ['把 42 個顏色值改為 CSS 變數', 2.4], ['執行 node tests/taskboard-theme.test.mjs', 3.0]];
  progress.forEach(([s, at], i) => { const p = seg(t0, at, at + 0.3); if (p <= 0) return; ctx.save(); ctx.globalAlpha *= p; const y = ay + 200 + i * 40; ctx.beginPath(); ctx.arc(cx + 12, y - 6, 5, 0, Math.PI * 2); ctx.fillStyle = C.muted; ctx.fill(); text(s, cx + 28, y, { size: 15, color: C.muted }); ctx.restore(); });
  const rp = seg(t0, 3.6, 4.1); if (rp > 0) { ctx.save(); ctx.globalAlpha *= rp; rr(cx, ay + 330, cw - 60, 92, 14); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); text('已完成變數化與 prefers-color-scheme 切換，', cx + 20, ay + 366, { size: 16 }); text('明暗截圖附在 work/，測試 7 項通過。', cx + 20, ay + 396, { size: 16 }); text('Claude Code', cx, ay + 444, { size: 12, color: C.muted }); ctx.restore(); }
  // 工作中的狀態列
  const working = t0 > 1.4 && t0 < 3.9; if (working) { const dot = 0.5 + 0.5 * Math.sin(t0 * 8); ctx.beginPath(); ctx.arc(cx + 12, ay + ah - 48, 6, 0, Math.PI * 2); ctx.fillStyle = rgba(C.orange, 0.4 + 0.6 * dot); ctx.fill(); text('Claude Code 工作中…', cx + 28, ay + ah - 42, { size: 15, color: C.orange, weight: 600 }); }
  // 右：看板（4 欄）
  const bx = 930, by = 130, bw = 900, bh = 790; drawPanel(bx, by, bw, bh); drawAppHeader(bx, by, bw);
  const cols = [['todo', '待辦'], ['in_progress', '進行中'], ['in_review', '待審核'], ['done', '已完成']], colW = (bw - 64 - 3 * 16) / 4, cy = by + 90, colH = bh - 200;
  cols.forEach(([key, label], i) => { const x = bx + 32 + i * (colW + 16); rr(x, cy, colW, colH, 14); ctx.fillStyle = C.column; ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke(); ctx.beginPath(); ctx.arc(x + 20, cy + 26, 5, 0, Math.PI * 2); ctx.fillStyle = C.status[key]; ctx.fill(); text(label, x + 34, cy + 32, { size: 17, weight: 700 }); });
  const colX = i => bx + 32 + i * (colW + 16) + 10;
  // 既有卡片
  miniCard(colX(0), cy + 54, colW - 20, '新增 SQLite migration', 'todo', {}); miniCard(colX(3), cy + 54, colW - 20, '建立桌面捷徑啟動器', 'done', {});
  // 鏡像卡：turn.start 建卡進進行中 → turn.complete 進待審核
  const cardIn = seg(t0, 1.5, 2.0, ease.back), toReview = seg(t0, 4.4, 5.0, ease.inOut);
  if (cardIn > 0) {
    const x = lerp(colX(1), colX(2), toReview), y = cy + 54 + (1 - cardIn) * -30, w = colW - 20, h = 128;
    ctx.save(); ctx.globalAlpha *= cardIn; ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; rr(x, y, w, h, 10); ctx.fillStyle = C.card; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2; ctx.strokeStyle = toReview > 0 && toReview < 1 ? C.accent : rgba(C.orange, 0.6); ctx.stroke(); rr(x, y + 8, 3, h - 16, 2); ctx.fillStyle = C.status[toReview > 0.5 ? 'in_review' : 'in_progress']; ctx.fill();
    pill('網站', x + 12, y + 10, { bg: 'rgba(255,255,255,0.08)', fg: C.muted, size: 11, h: 20, padX: 7, weight: 500 }); pill('Claude Code', x + 56, y + 10, { bg: TOOL.claude.bg, fg: TOOL.claude.fg, size: 11, h: 20, padX: 7 });
    text(clipLine(titleP > 0.5 ? 'CSS 變數與深色模式' : '請把 index.html 的色彩改為 CSS…', 13), x + 12, y + 56, { size: 16, weight: 650 });
    if (toReview < 0.5) badge('Claude App 對話執行中', x + 12, y + 68, C.orange, { size: 12 }); else badge('已回報 · 等待驗收', x + 12, y + 68, C.purple, { size: 12 });
    const runs = t0 >= 3.9 ? 1 : 0; text(`run · Claude App 對話 × ${Math.max(1, runs)}`, x + 12, y + h - 12, { size: 12, color: C.muted });
    ctx.restore();
  }
  // 事件飛行：turn.start / turn.complete
  const flyEvent = (label, a, b, fromY) => { const p = seg(t0, a, b, ease.inOut); if (p <= 0 || p >= 1) return; const sx = ax + aw - 10, ex = bx + 20, x = lerp(sx, ex, p), y = fromY - Math.sin(p * Math.PI) * 90; ctx.save(); ctx.globalAlpha *= Math.sin(p * Math.PI) * 0.6 + 0.4; ctx.shadowColor = C.accent; ctx.shadowBlur = 24; pill(label, x - measure(label, 14, 700) / 2 - 12, y - 14, { bg: rgba(C.accent, 0.35), fg: C.ink, size: 14, h: 28, padX: 12, weight: 700 }); ctx.restore(); };
  flyEvent('turn.start → POST /api/claude-turns', 0.9, 1.6, ay + 120); flyEvent('turn.complete → 待審核', 3.9, 4.5, ay + 380);
  // 同步說明列
  const sp = seg(t0, 5.0, 5.5); if (sp > 0) { ctx.save(); ctx.globalAlpha *= sp; ctx.translate(0, (1 - sp) * 20); const y = by + bh - 96; rr(bx + 32, y, bw - 64, 64, 14); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke(); ctx.beginPath(); ctx.arc(bx + 60, y + 32, 7, 0, Math.PI * 2); ctx.fillStyle = C.green; ctx.fill(); text('既有對話每 15 秒自動同步 · 30 個 Codex、351 個 Claude session · 來源 session 去重、同 session 延續', bx + 80, y + 38, { size: 15, color: C.muted }); ctx.restore(); }
  ctx.restore();
  sceneTag('02', 'Session 自動同步成卡片', t0, 0.2, len - 0.2);
  subtitle('Claude Code 對話一開始，看板就有卡片', t0, 1.2, len - 0.2);
}
function clipLine(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ---------- 場景 S3：對話訊息分類顯示與延續／開新 Session（7s） ----------
function sceneChat(t0, len) {
  const enter = seg(t0, 0, 0.6), leave = seg(t0, len - 0.4, len, ease.in);
  ctx.save(); ctx.globalAlpha = enter * (1 - leave);
  const sc = lerp(0.96, 1, enter) * lerp(1, 1.08, leave); ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
  // 左：聊天紀錄
  const dx = 110, dy = 110, dw = 1000, dh = 860; drawPanel(dx, dy, dw, dh);
  text('聊天紀錄', dx + 36, dy + 58, { size: 26, weight: 800 }); text('Claude Code session 3f2a9c1e · 網站 · 實作 CSS 變數切換', dx + 36, dy + 92, { size: 14, color: C.muted });
  const legend = [['你', C.accent], ['進度', C.muted], ['回報', '#dfe6ee']]; let lx = dx + dw - 36; legend.slice().reverse().forEach(([l, c]) => { lx -= measure(l, 13, 700) + 20; pill(l, lx, dy + 40, { bg: rgba(c === C.muted ? '#94a0b2' : c, 0.18), fg: c, size: 13, h: 24, padX: 10 }); lx -= 8; });
  const turns = [['回合 1', '已完成', '請改用 CSS 變數，並支援深色模式。', '12:04'], ['回合 2', '已完成', '請同步 accent 色到原生 token。', '12:09']];
  let y = dy + 120;
  turns.forEach(([no, st, lead, time], i) => { const p = seg(t0, 0.3 + i * 0.2, 0.7 + i * 0.2); ctx.save(); ctx.globalAlpha *= p; ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(dx + 36, y); ctx.lineTo(dx + dw - 36, y); ctx.stroke(); text('▸', dx + 40, y + 36, { size: 14, color: C.muted }); text(`${no} · ${st} · ${lead}`, dx + 62, y + 36, { size: 16, weight: 650 }); text(time, dx + dw - 40, y + 36, { size: 13, color: C.muted, align: 'right' }); ctx.restore(); y += 56; });
  // 回合 3 展開
  const p3 = seg(t0, 0.8, 1.2); ctx.save(); ctx.globalAlpha *= p3; ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(dx + 36, y); ctx.lineTo(dx + dw - 36, y); ctx.stroke(); text('▾', dx + 40, y + 36, { size: 14, color: C.muted }); text('回合 3 · 執行中 · 補上明暗兩種截圖並更新文件。', dx + 62, y + 36, { size: 16, weight: 650 }); text('12:15', dx + dw - 40, y + 36, { size: 13, color: C.muted, align: 'right' }); ctx.restore(); y += 60;
  const msgs = [['user', '你', '補上明暗兩種截圖並更新文件。', 1.2], ['progress', '進度', '讀取 work/ 目錄並擷取 index.html 明暗畫面…', 1.6], ['progress', '進度', '更新 docs/current-status.md', 2.0], ['agent', '回報', '已附兩張截圖：work/theme-light.png、work/theme-dark.png，文件已更新。', 2.4], ['user', '你', '請同步 accent 色到原生 token。', 2.9]];
  msgs.forEach(([kind, who, body, at]) => { const p = seg(t0, at, at + 0.35); if (p > 0) { ctx.save(); ctx.translate((1 - p) * -16, 0); msgBubble(kind, who, body, dx + 48, y, dw - 96, { alpha: p }); ctx.restore(); } y += 70; });
  // 右：對話方式
  const rx = 1150, rw = 670; drawPanel(rx, dy, rw, dh);
  text('後續需求／再次對話', rx + 32, dy + 58, { size: 22, weight: 800 });
  text('對話方式', rx + 32, dy + 108, { size: 15, color: C.muted });
  const opts = [['延續 Claude Code session 3f2a9c1e', '同一個工具接續同一個對話', 'claude'], ['開新對話 · Claude Code', '帶入任務需求與最近三次回報', 'claude'], ['跨工具接手 · Codex', '以 Codex 開新對話並帶入摘要，不恢復原 session', 'codex']];
  const pick = t0 < 3.2 ? 0 : t0 < 4.8 ? 1 : 2; const pickP = seg(t0, pick === 0 ? 1.4 : pick === 1 ? 3.2 : 4.8, pick === 0 ? 1.8 : pick === 1 ? 3.6 : 5.2);
  opts.forEach(([title, hint, tool], i) => { const p = seg(t0, 1.0 + i * 0.15, 1.4 + i * 0.15); if (p <= 0) return; const oy = dy + 124 + i * 96, on = i === pick; ctx.save(); ctx.globalAlpha *= p; rr(rx + 32, oy, rw - 64, 82, 12); ctx.fillStyle = on ? rgba(C.accent, 0.12 + 0.1 * pickP) : 'rgba(255,255,255,0.04)'; ctx.fill(); ctx.lineWidth = on ? 2 : 1; ctx.strokeStyle = on ? rgba(C.accent, 0.5 + 0.5 * pickP) : C.line; ctx.stroke();
    ctx.beginPath(); ctx.arc(rx + 58, oy + 41, 9, 0, Math.PI * 2); ctx.strokeStyle = on ? C.accent : C.muted; ctx.lineWidth = 2; ctx.stroke(); if (on) { ctx.beginPath(); ctx.arc(rx + 58, oy + 41, 5 * pickP, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill(); }
    text(title, rx + 82, oy + 34, { size: 17, weight: 700, color: on ? C.ink : C.muted }); pill(TOOL[tool].label, rx + rw - 150, oy + 16, { bg: TOOL[tool].bg, fg: TOOL[tool].fg, size: 12, h: 22, padX: 8 }); text(hint, rx + 82, oy + 62, { size: 14, color: C.muted }); ctx.restore(); });
  // 需求輸入
  const ty = dy + 440, fp = seg(t0, 1.6, 2.0); ctx.save(); ctx.globalAlpha *= fp; text('後續需求', rx + 32, ty - 10, { size: 15, color: C.muted }); rr(rx + 32, ty, rw - 64, 110, 12); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke();
  const req = '原生 token 的 accent 已變更，請同步到 --accent 與 --accent-light，並重跑主題測試。'; const tq = seg(t0, 5.0, 6.0, p => p); const line1 = typed(req, tq); text(line1.slice(0, 30), rx + 50, ty + 42, { size: 16 }); text(line1.slice(30), rx + 50, ty + 74, { size: 16 });
  text('送出後', rx + 32, ty + 150, { size: 15, color: C.muted }); rr(rx + 100, ty + 128, 420, 36, 10); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); text('排入待辦（自動派工依優先級與排隊順序執行）▾', rx + 114, ty + 152, { size: 14 });
  const bp = seg(t0, 6.1, 6.3); rr(rx + 32, ty + 190, 200, 44, 22); ctx.fillStyle = bp > 0 ? C.accent : rgba(C.accent, 0.8); ctx.fill(); text('送出後續需求', rx + 132, ty + 213, { size: 16, weight: 800, color: '#06111c', align: 'center', baseline: 'middle' });
  if (bp > 0) { ctx.beginPath(); ctx.arc(rx + 132, ty + 212, 20 + bp * 50, 0, Math.PI * 2); ctx.strokeStyle = rgba(C.accent, 1 - bp); ctx.lineWidth = 3; ctx.stroke(); }
  ctx.restore();
  // 游標：點選項 → 點按鈕
  const c1 = seg(t0, 2.8, 3.2, ease.inOut), c2 = seg(t0, 4.4, 4.8, ease.inOut), c3 = seg(t0, 5.7, 6.1, ease.inOut);
  let cxp = lerp(rx + 400, rx + 300, c1), cyp = lerp(dy + 500, dy + 124 + 96 + 41, c1); cxp = lerp(cxp, rx + 300, c2); cyp = lerp(cyp, dy + 124 + 192 + 41, c2); cxp = lerp(cxp, rx + 132, c3); cyp = lerp(cyp, ty + 212, c3);
  if (t0 > 2.4) cursor(cxp, cyp, { alpha: seg(t0, 2.4, 2.7), press: (t0 > 3.2 && t0 < 3.4) || (t0 > 4.8 && t0 < 5.0) || (t0 > 6.1 && t0 < 6.3) });
  ctx.restore();
  sceneTag('03', '對話分類顯示', t0, 0.2, len - 0.2);
  subtitle('你／進度／回報分色，延續同一 Session 或開新對話', t0, 1.2, len - 0.2);
}

// ---------- 場景 S4：Session 心智圖（7s） ----------
function sceneMap(t0, len) {
  const enter = seg(t0, 0, 0.6), leave = seg(t0, len - 0.4, len, ease.in);
  ctx.save(); ctx.globalAlpha = enter * (1 - leave);
  const sc = lerp(0.96, 1, enter) * lerp(1, 1.08, leave); ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
  const dx = 120, dy = 100, dw = 1680, dh = 880; drawPanel(dx, dy, dw, dh);
  text('Session 心智圖 · 實作 CSS 變數切換', dx + 36, dy + 58, { size: 26, weight: 800 });
  let tx = dx + 36; [['2 個 session', null], ['5 次對話', null], ['Claude Code × 1', 'claude'], ['Codex × 1', 'codex']].forEach(([l, tool]) => { tx += pill(l, tx, dy + 78, { bg: tool ? TOOL[tool].bg : 'rgba(255,255,255,0.08)', fg: tool ? TOOL[tool].fg : C.muted, size: 13, h: 26, padX: 10, weight: tool ? 650 : 500 }) + 8; });
  // 工具列
  const zoomP = seg(t0, 5.0, 5.6, ease.inOut), zoom = lerp(1, 1.12, zoomP);
  let bx = dx + dw - 36; [['符合寬度', false], ['＋', false], [Math.round(zoom * 100) + '%', false], ['－', false], ['⛶ 放大視窗', false], ['全部收合', false], ['全部展開', false]].forEach(([l]) => { const w = measure(l, 13, 600) + 22; bx -= w; rr(bx, dy + 76, w, 30, 8); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); text(l, bx + 11, dy + 96, { size: 13, weight: 600, color: C.ink }); bx -= 8; });
  pill('Ctrl＋M', dx + dw - 36 - 70, dy + 40, { bg: rgba(C.accent, 0.18), fg: '#7cc0ff', size: 13, h: 26, padX: 10 });
  // 畫布
  const cvx = dx + 36, cvy = dy + 124, cvw = dw - 72, cvh = dh - 160; rr(cvx, cvy, cvw, cvh, 14); ctx.fillStyle = C.column; ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke();
  const anchorX = cvx + 24, anchorY = cvy + cvh / 2; ctx.save(); rr(cvx, cvy, cvw, cvh, 14); ctx.clip(); ctx.translate(anchorX, anchorY); ctx.scale(zoom, zoom); ctx.translate(-anchorX, -anchorY);
  const NH = 58, ROOT = { x: cvx + 50, w: 300 }, SES = { x: cvx + 440, w: 360 }, RUN = { x: cvx + 890, w: 520 };
  const collapse = seg(t0, 3.5, 3.9), expand = seg(t0, 4.4, 4.8); const codexOpen = 1 - collapse + expand * collapse; // 1 展開, 0 收合
  const sessionsDef = [
    { tool: 'claude', title: 'CSS 變數與深色模式', sub: 'Claude Code · 首次執行 · 3 次對話', runs: [['1. 請改用 CSS 變數，並支援深色…', '首次執行 · 已回報 · 待驗收 · 12:04', 'in_review'], ['2. 請同步 accent 色到原生 token。', '後續修正 · 已回報 · 待驗收 · 12:09', 'in_review'], ['3. 補上明暗兩種截圖並更新文件。', '開新對話 · 執行中 · 12:15', 'in_progress']], open: 1 },
    { tool: 'codex', title: '以 Codex 接手驗證主題', sub: 'Codex · 跨工具接手 · 2 次對話', runs: [['4. 以 Codex 接手驗證明暗與自訂色彩', '跨工具接手 · 已回報 · 待驗收 · 13:02', 'in_review'], ['5. 修正主題測試的 fixture', '後續修正 · 失敗 · 13:20', 'failed']], open: codexOpen },
  ];
  const ROW = 76; const rowsOf = s => Math.max(1, s.runs.length * s.open); const totalRows = sessionsDef.reduce((n, s) => n + rowsOf(s), 0); const top = cvy + cvh / 2 - totalRows * ROW / 2;
  const rootY = cvy + cvh / 2 - NH / 2 - 6, rootP = seg(t0, 0.3, 0.7, ease.back);
  const node = (x, y, w, h, main, sub, { color = C.line, dot = null, alpha = 1, glowA = 0, fill = C.card } = {}) => { ctx.save(); ctx.globalAlpha *= alpha; if (glowA) { ctx.shadowColor = C.accent; ctx.shadowBlur = 28 * glowA; } rr(x, y, w, h, 10); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 1.5; ctx.strokeStyle = color; ctx.stroke(); if (glowA) { ctx.lineWidth = 2; ctx.strokeStyle = rgba(C.accent, glowA); rr(x - 5, y - 5, w + 10, h + 10, 13); ctx.stroke(); } let ix = x + 16; if (dot) { ctx.beginPath(); ctx.arc(x + 18, y + h / 2, 6, 0, Math.PI * 2); ctx.fillStyle = dot; ctx.fill(); ix = x + 34; } text(main, ix, y + (sub ? 26 : h / 2 + 6), { size: 17, weight: 700 }); if (sub) text(sub, ix, y + 46, { size: 13, color: C.muted }); ctx.restore(); };
  const edge = (x1, y1, x2, y2, p, color = 'rgba(148,160,178,0.55)') => { if (p <= 0) return; ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; const mid = (x1 + x2) / 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.bezierCurveTo(mid, y1, mid, y2, x2, y2); const L = Math.hypot(x2 - x1, y2 - y1) * 1.2; ctx.setLineDash([L * p, L]); ctx.stroke(); ctx.restore(); };
  // 根節點
  ctx.save(); ctx.translate(ROOT.x + ROOT.w / 2, rootY + (NH + 8) / 2); ctx.scale(rootP, rootP); ctx.translate(-(ROOT.x + ROOT.w / 2), -(rootY + (NH + 8) / 2)); node(ROOT.x, rootY, ROOT.w, NH + 8, '實作 CSS 變數切換', '2 session · 5 對話', { color: rgba(C.accent, 0.6), fill: rgba(C.accent, 0.14) }); ctx.restore();
  let row = 0, runIndex = 0;
  const focusRun = seg(t0, 6.0, 6.3);
  sessionsDef.forEach((s, si) => {
    const span = rowsOf(s), sy = top + row * ROW + (span * ROW - NH) / 2, ep = seg(t0, 0.6 + si * 0.25, 1.2 + si * 0.25, ease.inOut), np = seg(t0, 0.9 + si * 0.25, 1.3 + si * 0.25);
    edge(ROOT.x + ROOT.w, rootY + (NH + 8) / 2, SES.x, sy + NH / 2, ep);
    const col = TOOL[s.tool].fg; node(SES.x, sy, SES.w, NH, s.title, s.sub + (s.open < 0.5 ? ' · 已收合' : ''), { color: rgba(col, 0.7), fill: rgba(col, 0.1), alpha: np });
    // ＋／− 切換鈕
    const tgx = SES.x + SES.w + 22; ctx.save(); ctx.globalAlpha *= np; ctx.strokeStyle = 'rgba(148,160,178,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(SES.x + SES.w, sy + NH / 2); ctx.lineTo(tgx - 11, sy + NH / 2); ctx.stroke(); ctx.beginPath(); ctx.arc(tgx, sy + NH / 2, 11, 0, Math.PI * 2); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = C.muted; ctx.stroke(); text(s.open < 0.5 ? '+' : '−', tgx, sy + NH / 2 + 1, { size: 16, weight: 800, align: 'center', baseline: 'middle', color: C.ink }); ctx.restore();
    s.runs.forEach((r, ri) => {
      const idx = runIndex + ri, ly = top + (row + ri) * ROW + (ROW - NH) / 2, rp = seg(t0, 1.4 + idx * 0.22, 1.8 + idx * 0.22, ease.back) * s.open; if (rp <= 0) return;
      edge(tgx + 11, sy + NH / 2, RUN.x, ly + NH / 2, seg(t0, 1.3 + idx * 0.22, 1.7 + idx * 0.22) * s.open);
      const dotColor = r[2] === 'failed' ? '#ff8583' : C.status[r[2]]; const isFocus = idx === 1;
      ctx.save(); ctx.translate(RUN.x + RUN.w / 2, ly + NH / 2); ctx.scale(lerp(0.9, 1, rp), lerp(0.9, 1, rp)); ctx.translate(-(RUN.x + RUN.w / 2), -(ly + NH / 2));
      node(RUN.x, ly, RUN.w, NH, r[0], r[1], { dot: dotColor, alpha: clamp(rp * 1.4), glowA: isFocus ? focusRun : 0 }); ctx.restore();
    });
    row += span; runIndex += s.runs.length;
  });
  ctx.restore();
  // 游標：點 Codex 收合、展開、縮放＋、點第 2 筆對話
  const codexSy = top + rowsOf(sessionsDef[0]) * ROW + (rowsOf(sessionsDef[1]) * ROW - NH) / 2, tgx = SES.x + SES.w + 22;
  const c1 = seg(t0, 3.0, 3.5, ease.inOut), c2 = seg(t0, 4.9, 5.0, ease.inOut), c3 = seg(t0, 5.6, 6.0, ease.inOut);
  const plusX = dx + dw - 36 - measure('符合寬度', 13, 600) - 22 - 8 - (measure('＋', 13, 600) + 22) / 2;
  let cxp = lerp(cvx + 700, tgx, c1), cyp = lerp(cvy + cvh - 60, codexSy + NH / 2, c1); cxp = lerp(cxp, plusX, c2); cyp = lerp(cyp, dy + 91, c2);
  const run2x = anchorX + (RUN.x + 120 - anchorX) * zoom, run2y = anchorY + (top + 1 * ROW + ROW / 2 - anchorY) * zoom; cxp = lerp(cxp, run2x, c3); cyp = lerp(cyp, run2y, c3);
  if (t0 > 2.6) cursor(cxp, cyp, { alpha: seg(t0, 2.6, 2.9), press: (t0 > 3.5 && t0 < 3.7) || (t0 > 4.4 && t0 < 4.6) || (t0 > 5.0 && t0 < 5.2) || (t0 > 6.0 && t0 < 6.2) });
  const toastP = seg(t0, 6.2, 6.5); if (toastP > 0) { ctx.save(); ctx.globalAlpha *= toastP; const s = '已跳到詳情中的第 2 筆回報並標示'; const w = measure(s, 15, 600) + 40; rr(W / 2 - w / 2, dy + dh - 70, w, 40, 20); ctx.fillStyle = rgba(C.accent, 0.25); ctx.fill(); ctx.strokeStyle = rgba(C.accent, 0.6); ctx.stroke(); text(s, W / 2, dy + dh - 44, { size: 15, weight: 600, align: 'center' }); ctx.restore(); }
  ctx.restore();
  sceneTag('04', 'Session 心智圖', t0, 0.2, len - 0.2);
  subtitle('Ctrl＋M 開啟心智圖，session 脈絡一目了然', t0, 1.2, len - 0.2);
}

// ---------- 結尾定格（42–45s） ----------
function outroLong(t) {
  const o = SLOTS.outro, p = seg(t, o, o + 0.6); if (p <= 0) return;
  ctx.save(); ctx.globalAlpha = p;
  ctx.fillStyle = 'rgba(5,7,11,0.6)'; ctx.fillRect(0, 0, W, H);
  glow(W / 2, H / 2, 700, 'rgba(51,156,255,0.22)', p);
  const lx = W / 2 - 300, ly = H / 2 - 170; ctx.save(); ctx.translate(0, (1 - p) * 30);
  const ip = seg(t, o + 0.05, o + 0.6, ease.back); ctx.save(); ctx.translate(lx + 50, ly + 60); ctx.scale(ip, ip); ctx.translate(-50, -60);
  rr(0, 0, 100, 120, 20); ctx.fillStyle = C.accent; ctx.fill(); [0, 1, 2].forEach(i => { rr(18 + i * 24, 18, 16, i === 1 ? 84 : 56, 6); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill(); });
  ctx.restore();
  text('TaskBoardTool', lx + 130, ly + 70, { size: 72, weight: 800, ls: 1 });
  text('讓 AI 開發任務一目了然', lx + 134, ly + 118, { size: 24, color: C.muted, weight: 500 });
  const sp = seg(t, o + 0.3, o + 0.85); ctx.save(); ctx.globalAlpha *= sp; ctx.translate(0, (1 - sp) * 20);
  text('讓 AI 執行，讓你掌握', W / 2, ly + 260, { size: 60, weight: 800, align: 'center', color: C.ink, ls: 4 });
  const g = ctx.createLinearGradient(W / 2 - 320, 0, W / 2 + 320, 0); g.addColorStop(0, 'rgba(51,156,255,0)'); g.addColorStop(0.5, C.accent); g.addColorStop(1, 'rgba(51,156,255,0)');
  ctx.fillStyle = g; ctx.fillRect(W / 2 - 320 * sp, ly + 290, 640 * sp, 3);
  let px = W / 2 - 150; px += pill('Codex', px, ly + 330, { bg: TOOL.codex.bg, fg: TOOL.codex.fg, size: 18, h: 36, padX: 16 }) + 12; text('×', px + 8, ly + 356, { size: 20, color: C.muted }); pill('Claude Code', px + 36, ly + 330, { bg: TOOL.claude.bg, fg: TOOL.claude.fg, size: 18, h: 36, padX: 16 });
  const fp = seg(t, o + 0.9, o + 1.4); ctx.save(); ctx.globalAlpha *= fp; const feats = ['集中管理', 'Session 同步', '對話分類', '心智圖', '計畫派工', '驗收追蹤']; const fw = feats.reduce((s, f) => s + measure(f, 15, 600) + 24 + 10, -10); let fx = W / 2 - fw / 2; feats.forEach(f => { fx += pill(f, fx, ly + 400, { bg: 'rgba(255,255,255,0.07)', fg: C.muted, size: 15, h: 30, padX: 12, weight: 600 }) + 10; }); ctx.restore();
  ctx.restore(); ctx.restore(); ctx.restore();
}

function render(t) {
  t = clamp(t, 0, DUR);
  drawBackground(t);
  const S = SLOTS, within = (k, pad = 0.1) => t >= S[k][0] - pad && t < S[k][1] + pad;
  if (t < S.s1[1] + 0.05) scene1(t, S.s1[1] - S.s1[0]);
  if (within('s2')) sceneSync(t - S.s2[0], S.s2[1] - S.s2[0]);
  if (within('s3')) sceneChat(t - S.s3[0], S.s3[1] - S.s3[0]);
  if (within('s4')) sceneMap(t - S.s4[0], S.s4[1] - S.s4[0]);
  if (within('s5')) { const k = 5 / (S.s5[1] - S.s5[0]); scene2((t - S.s5[0]) * k, 5); }
  if (within('s6')) { const k = 4.2 / (S.s6[1] - S.s6[0]); scene3((t - S.s6[0]) * k, 4.2); }
  outroLong(t);
  for (const cut of [S.s2[0], S.s3[0], S.s4[0], S.s5[0], S.s6[0]]) { const f = 1 - clamp(Math.abs(t - cut) / 0.18); if (f > 0) { ctx.fillStyle = `rgba(120,180,255,${f * 0.18})`; ctx.fillRect(0, 0, W, H); } }
  const fi = seg(t, 0, 0.5); if (fi < 1) { ctx.fillStyle = `rgba(5,7,11,${1 - fi})`; ctx.fillRect(0, 0, W, H); }
}

// ---------- 背景音樂（45 秒：intro → 主段 → breakdown → 主段 → 結尾） ----------
async function buildMusic() {
  const sr = 48000, ac = new OfflineAudioContext(2, sr * DUR, sr), BPM = 128, beat = 60 / BPM;
  const master = ac.createGain(); master.gain.value = 0.72;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.12;
  master.connect(comp); comp.connect(ac.destination);
  const conv = ac.createConvolver(); const irLen = sr * 1.6, ir = ac.createBuffer(2, irLen, sr);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2); }
  conv.buffer = ir; const rev = ac.createGain(); rev.gain.value = 0.22; conv.connect(rev); rev.connect(master);
  const n2f = n => 440 * Math.pow(2, (n - 69) / 12);
  const osc = (type, freq, t, dur, { gain = 0.2, attack = 0.005, decay = dur, lp = null, pan = 0, send = 0.3, detune = 0 } = {}) => {
    const o = ac.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    let node = o; if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(lp, t); f.frequency.exponentialRampToValueAtTime(Math.max(200, lp * 0.25), t + decay); f.Q.value = 2; o.connect(f); node = f; }
    const p = ac.createStereoPanner(); p.pan.value = pan; node.connect(g); g.connect(p); p.connect(master);
    if (send) { const s = ac.createGain(); s.gain.value = send; p.connect(s); s.connect(conv); }
    o.start(t); o.stop(t + decay + 0.05);
  };
  const noise = (t, dur, { gain = 0.1, hp = 6000, pan = 0 } = {}) => {
    const b = ac.createBuffer(1, Math.ceil(sr * dur), sr), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); const p = ac.createStereoPanner(); p.pan.value = pan;
    s.connect(f); f.connect(g); g.connect(p); p.connect(master); s.start(t); s.stop(t + dur);
  };
  const kick = t => { const o = ac.createOscillator(); o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); const g = ac.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.32); };
  const snare = t => { noise(t, 0.16, { gain: 0.35, hp: 1800 }); osc('triangle', 190, t, 0.12, { gain: 0.3, send: 0.4 }); };
  const prog = [[62, 66, 69], [57, 61, 64], [59, 62, 66], [55, 59, 62]];
  const bars = Math.ceil(DUR / (beat * 4)), endT = SLOTS.outro - 0.1;
  // 段落：bar 0–1 intro、2–9 主段、10–11 breakdown、12–21 主段、22+ 收尾
  const section = bar => bar < 2 ? 'intro' : bar < 10 ? 'main' : bar < 12 ? 'break' : 'main2';
  for (let bar = 0; bar < bars; bar++) {
    const chord = prog[bar % 4], root = chord[0], t0 = bar * beat * 4, sec = section(bar);
    if (t0 >= endT) break;
    const drums = sec === 'main' || sec === 'main2';
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * beat; if (t >= endT - 0.05) continue;
      if (drums || (sec === 'intro' && bar === 1 && b >= 2)) kick(t);
      if (drums && (b === 1 || b === 3)) snare(t);
      if (drums && bar % 4 === 3 && b === 3) for (let k = 0; k < 4; k++) noise(t + k * beat / 4, 0.08, { gain: 0.22, hp: 2500 }); // 每 4 小節尾的小鼓滾奏
      noise(t, 0.05, { gain: sec === 'break' ? 0.06 : 0.12, hp: 9000, pan: 0.25 }); noise(t + beat / 2, 0.035, { gain: 0.07, hp: 10000, pan: -0.25 });
      if (sec !== 'break') { osc('sawtooth', n2f(root - 24 + (b % 2 ? 12 : 0)), t, beat * 0.5, { gain: 0.26, lp: 900, send: 0.05 }); osc('sawtooth', n2f(root - 24), t + beat / 2, beat * 0.45, { gain: 0.2, lp: 700, send: 0.05 }); }
      else osc('sawtooth', n2f(root - 24), t, beat, { gain: 0.16, lp: 500, send: 0.1 });
      for (let s = 0; s < 4; s++) { const n = chord[(b * 4 + s) % 3] + 12 + (s === 3 ? 12 : 0); osc('square', n2f(n), t + s * beat / 4, beat * 0.22, { gain: sec === 'intro' ? 0.09 : 0.07, lp: sec === 'break' ? 1800 : 3200, pan: (s - 1.5) * 0.3, send: 0.5 }); }
    }
    chord.forEach((n, i) => { osc('sawtooth', n2f(n), t0, beat * 4, { gain: sec === 'break' ? 0.07 : 0.045, attack: 0.3, lp: 1800, pan: (i - 1) * 0.5, send: 0.8, detune: (i - 1) * 7 }); osc('sawtooth', n2f(n), t0, beat * 4, { gain: sec === 'break' ? 0.07 : 0.045, attack: 0.3, lp: 1800, pan: (1 - i) * 0.5, send: 0.8, detune: (1 - i) * 7 }); });
    const melA = [[0, chord[2] + 12], [0.5, chord[0] + 24], [1, chord[1] + 12], [1.75, chord[2] + 12], [2.5, chord[0] + 24], [3, chord[1] + 24]], melB = [[0, chord[0] + 24], [0.75, chord[2] + 12], [1.5, chord[1] + 12], [2, chord[0] + 12], [3, chord[2] + 12]];
    const melC = [[0, chord[1] + 24], [0.5, chord[2] + 24], [1, chord[0] + 24], [2, chord[2] + 12], [2.5, chord[1] + 24], [3.5, chord[0] + 24]];
    const mel = sec === 'main2' ? (bar % 2 ? melB : melC) : bar % 2 === 0 ? melA : melB;
    if (sec !== 'intro') mel.forEach(([off, n]) => { const t = t0 + off * beat; if (t < endT - 0.4) osc(sec === 'break' ? 'sine' : 'triangle', n2f(n), t, beat * 0.9, { gain: sec === 'break' ? 0.16 : 0.2, attack: 0.01, send: 0.6, pan: 0.1 }); });
  }
  kick(endT); noise(endT, 0.6, { gain: 0.25, hp: 3000 });
  [62, 66, 69, 74, 78, 81].forEach((n, i) => osc('triangle', n2f(n + 12), endT + i * 0.05, 1.3 - i * 0.05, { gain: 0.12, attack: 0.01, send: 0.9, pan: (i - 2.5) * 0.3 }));
  osc('sawtooth', n2f(62), endT, 2.4, { gain: 0.06, attack: 0.2, lp: 1500, send: 0.9 }); osc('sawtooth', n2f(66), endT, 2.4, { gain: 0.05, attack: 0.2, lp: 1500, send: 0.9, pan: 0.4 }); osc('sawtooth', n2f(69), endT, 2.4, { gain: 0.05, attack: 0.2, lp: 1500, send: 0.9, pan: -0.4 });
  master.gain.setValueAtTime(0.72, DUR - 1.2); master.gain.linearRampToValueAtTime(0.0, DUR - 0.02);
  return ac.startRendering();
}
