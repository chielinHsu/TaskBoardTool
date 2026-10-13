# -*- coding: utf-8 -*-
"""把 promo.html 的共用繪圖程式與場景 1–3 和 scenes-long.js 併成 45 秒版 promo-long.html。"""
import re
src = open('promo.html', encoding='utf-8').read()
extra = open('scenes-long.js', encoding='utf-8').read()
def cut(a, b): i = src.index(a); j = src.index(b, i); return src[i:j]
head = src[:src.index('// ---------- 場景 1')]
head = head.replace('DUR = 15', 'DUR = 45').replace('max="15"', 'max="45"').replace('15 秒動態簡報', '45 秒動態簡報')
s1 = cut('// ---------- 場景 1', '// ---------- 場景 2')
s2 = cut('// ---------- 場景 2', '// ---------- 場景 3')
s3 = cut('// ---------- 場景 3', '// ---------- 結尾定格')
tail = src[src.index('// ---------- 播放／錄製'):]
def rep(s, a, b):
    assert s.count(a) == 1, a
    return s.replace(a, b)
s1 = rep(s1, 'function scene1(t) {', 'function scene1(t, len) {')
s1 = rep(s1, 'leave = seg(t, 4.55, 5.0, ease.in)', 'leave = seg(t, len - 0.45, len, ease.in)')
s1 = rep(s1, "sceneTag('01', '集中管理任務', t, 0.3, 4.8)", "sceneTag('01', '集中管理任務', t, 0.3, len - 0.2)")
s1 = rep(s1, "subtitle('Codex × Claude Code，一個看板掌握進度', t, 1.6, 4.8)", "subtitle('Codex × Claude Code，一個看板掌握進度', t, 1.6, len - 0.2)")
s2 = rep(s2, 'function scene2(t) {\n  const t0 = t - 5; // 區域時間 0..5', 'function scene2(t0, len) {')
s2 = rep(s2, 'leave = seg(t0, 4.6, 5.0, ease.in)', 'leave = seg(t0, len - 0.4, len, ease.in)')
s2 = rep(s2, "sceneTag('02', '從計畫到執行', t, 5.2, 9.8)", "sceneTag('05', '從計畫到執行', t0, 0.2, len - 0.2)")
s2 = rep(s2, "subtitle('匯入計畫，依序執行', t, 6.3, 9.8)", "subtitle('匯入計畫，依序執行', t0, 1.3, len - 0.2)")
s3 = rep(s3, 'function scene3(t) {\n  const t0 = t - 10;', 'function scene3(t0, len) {')
s3 = rep(s3, 'leave = seg(t0, 3.75, 4.2, ease.in)', 'leave = seg(t0, len - 0.45, len, ease.in)')
s3 = rep(s3, "sceneTag('03', '成果追蹤與驗收', t, 10.2, 13.9)", "sceneTag('06', '成果追蹤與驗收', t0, 0.2, len - 0.3)")
s3 = rep(s3, "subtitle('完成先待審核，驗收後才算完成', t, 11.0, 13.9)", "subtitle('完成先待審核，驗收後才算完成', t0, 1.0, len - 0.3)")
out = head + s1 + s2 + s3 + extra + '\n' + tail
open('promo-long.html', 'w', encoding='utf-8').write(out)
print('built promo-long.html', len(out))
