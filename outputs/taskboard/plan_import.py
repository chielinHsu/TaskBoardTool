"""Submit a plan (feature broken into items) to the local taskboard: python plan_import.py plan.json

Stdlib only, loopback only. The plan JSON:
{
  "name": "深色模式", "project": "網站", "cwd": "C:\\\\path\\\\to\\\\repo", "tool": "claude",
  "items": [
    {"key": "tokens", "title": "定義色彩 token", "description": "…驗收條件…", "role": "developer"},
    {"key": "css", "title": "套用深色樣式", "role": "developer-deep", "dependsOn": ["tokens"]},
    {"key": "docs", "title": "更新文件", "tool": "codex", "dependsOn": ["tokens"], "priority": "low"}
  ]
}
role（Claude Code）依 MODEL_ROUTING.md 對應 model／effort：fast-worker=haiku/low、developer=sonnet/medium、
developer-deep=sonnet/high、architect=opus/high、architect-deep=opus/xhigh；明確給 model／effort 可覆蓋。
dependsOn 以 key 指向前置事項；前置卡片全部驗收完成（已完成欄）後，被阻擋的卡片自動排入待辦。
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser(description='匯入計畫到本機任務看板')
    parser.add_argument('plan', help='計畫 JSON 檔案路徑，或 - 讀取 stdin')
    parser.add_argument('--board', default='http://127.0.0.1:47824', help='看板網址（僅限 loopback）')
    args = parser.parse_args()
    if not re.match(r'^http://(127\.0\.0\.1|localhost):\d+$', args.board):
        sys.exit('只允許 loopback 看板網址。')
    raw = sys.stdin.read() if args.plan == '-' else open(args.plan, encoding='utf-8').read()
    plan = json.loads(raw)
    try:
        page = urllib.request.urlopen(args.board + '/', timeout=10).read().decode('utf-8')
    except (urllib.error.URLError, OSError) as exc:
        sys.exit(f'看板服務未啟動：{exc}')
    token = re.search(r"const TOKEN='([^']+)'", page)
    if not token:
        sys.exit('無法取得看板 token。')
    request = urllib.request.Request(args.board + '/api/plans', method='POST', data=json.dumps(plan, ensure_ascii=False).encode('utf-8'),
                                     headers={'X-Board-Token': token.group(1), 'Content-Type': 'application/json'})
    try:
        result = json.loads(urllib.request.urlopen(request, timeout=60).read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', 'replace')
        try:
            detail = json.loads(detail).get('error', detail)
        except ValueError:
            pass
        sys.exit(f'匯入失敗（HTTP {exc.code}）：{detail}')
    print(f"計畫 {result['name']}（{result['planId']}）已建立 {len(result['tasks'])} 張卡片：")
    for task in result['tasks']:
        blockers = '、'.join(task['dependsOn']) if task['dependsOn'] else '無'
        print(f"- {task['plan']['key']} → {task['id']} [{task['tool']}{(' ' + task['model']) if task['model'] else ''}{('/' + task['effort']) if task['effort'] else ''}] "
              f"{task['title']}（{task['status']}；前置：{blockers}）")


if __name__ == '__main__':
    main()
