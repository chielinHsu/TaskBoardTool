"""Simulated `claude -p --input-format stream-json --output-format stream-json` for isolated tests.

Never contacts a model. Behaviour is driven by keywords in the prompt:
APPROVE → asks the host for tool permission; RATE_LIMIT → error result; CRASH → exits without
a result; HANG → waits until an interrupt arrives. Argv is appended to FAKE_CLAUDE_LOG.
"""
import json
import os
import sys
import time

args = sys.argv[1:]


def opt(name):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else None


def emit(message):
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + '\n')
    sys.stdout.flush()


if '--version' in args:
    print('9.9.9 (Fake Claude Code)')
    sys.exit(0)

if os.environ.get('FAKE_CLAUDE_LOG'):
    with open(os.environ['FAKE_CLAUDE_LOG'], 'a', encoding='utf-8') as log:
        log.write(json.dumps({'args': args, 'cwd': os.getcwd()}, ensure_ascii=False) + '\n')

session = opt('--session-id') or opt('--resume') or 'fake-session'
resumed = '--resume' in args
model = opt('--model') or 'default'
MODELS = [{'value': 'default', 'displayName': 'Default (recommended)', 'resolvedModel': 'claude-fake-5', 'supportedEffortLevels': ['low', 'high']},
          {'value': 'fake-opus', 'displayName': 'Fake Opus', 'resolvedModel': 'claude-fake-opus', 'supportedEffortLevels': ['low', 'high']},
          # The routing aliases of MODEL_ROUTING.md, shaped like the real catalogue (haiku reports no effort levels).
          {'value': 'opus', 'displayName': 'Opus', 'resolvedModel': 'claude-fake-opus', 'supportedEffortLevels': ['low', 'medium', 'high', 'xhigh', 'max']},
          {'value': 'sonnet', 'displayName': 'Sonnet', 'resolvedModel': 'claude-fake-sonnet', 'supportedEffortLevels': ['low', 'medium', 'high', 'xhigh', 'max']},
          {'value': 'haiku', 'displayName': 'Haiku', 'resolvedModel': 'claude-fake-haiku'}]
hanging = False

for line in sys.stdin:
    try:
        message = json.loads(line)
    except ValueError:
        continue
    kind = message.get('type')
    if kind == 'control_request':
        request = message.get('request') or {}
        rid = message.get('request_id')
        if request.get('subtype') == 'initialize':
            emit({'type': 'control_response', 'response': {'subtype': 'success', 'request_id': rid,
                                                           'response': {'models': MODELS, 'current_permission_mode': opt('--permission-mode')}}})
        elif request.get('subtype') == 'interrupt':
            emit({'type': 'control_response', 'response': {'subtype': 'success', 'request_id': rid, 'response': {'still_queued': []}}})
            if hanging:
                emit({'type': 'result', 'subtype': 'success', 'is_error': False, 'result': '已中止', 'session_id': session, 'total_cost_usd': 0.001})
                hanging = False
        continue
    if kind != 'user':
        continue
    text = message['message']['content'][0]['text']
    emit({'type': 'system', 'subtype': 'init', 'session_id': session, 'model': 'claude-fake-5', 'cwd': os.getcwd(),
          'permissionMode': opt('--permission-mode'), 'tools': ['Bash', 'Edit']})
    if 'CRASH' in text:
        sys.stderr.write('simulated crash: not logged in\n')
        sys.exit(3)
    if 'HANG' in text:
        hanging = True
        continue
    if 'APPROVE' in text:
        emit({'type': 'control_request', 'request_id': 'perm-1', 'request': {'subtype': 'can_use_tool', 'tool_name': 'Bash',
                                                                              'input': {'command': 'git status'}, 'permission_suggestions': []}})
        reply = None
        for raw in sys.stdin:
            try:
                candidate = json.loads(raw)
            except ValueError:
                continue
            if candidate.get('type') == 'control_response' and candidate['response'].get('request_id') == 'perm-1':
                reply = candidate['response'].get('response') or {}
                break
        if not reply:
            sys.exit(2)
        behavior = reply.get('behavior')
        if behavior != 'allow':
            emit({'type': 'result', 'subtype': 'success', 'is_error': False, 'result': '指令被拒絕，改以其他方式完成。', 'session_id': session,
                  'total_cost_usd': 0.002, 'permission_denials': [{'tool_name': 'Bash', 'tool_use_id': 'x', 'tool_input': reply}]})
            continue
    if 'RATE_LIMIT' in text:
        emit({'type': 'result', 'subtype': 'error_during_execution', 'is_error': True, 'result': 'You have hit your usage limit (rate limit).', 'session_id': session})
        continue
    emit({'type': 'assistant', 'session_id': session, 'message': {'role': 'assistant', 'content': [{'type': 'text', 'text': '進度：正在處理'}]}})
    time.sleep(0.02)
    emit({'type': 'result', 'subtype': 'success', 'is_error': False, 'session_id': session, 'total_cost_usd': 0.01, 'num_turns': 2,
          'result': f'假 Claude 回報：resumed={str(resumed).lower()} model={model} session={session}\n需求摘要：{text[:120]}'})
