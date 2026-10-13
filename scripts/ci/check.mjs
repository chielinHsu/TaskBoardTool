import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
function run(command, args) {
  const result = spawnSync(command, args, {stdio: 'inherit', shell: false});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
fs.mkdirSync('work', {recursive: true});
for (const file of fs.readdirSync('outputs/taskboard').filter(f => /\.(js|mjs)$/.test(f))) run(process.execPath, ['--check', path.join('outputs/taskboard', file)]);
for (const match of fs.readFileSync('outputs/taskboard/index.html', 'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
run(process.env.PYTHON_BIN || 'python', ['-X', 'utf8', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_taskboard_*.py', '-v']);
const portable = fs.readdirSync('tests').filter(f => /^(taskboard-(theme|markdown|mermaid-setup|demo)|ai-automation)\.test\.mjs$/.test(f));
run(process.execPath, ['--test', ...portable.map(f => 'tests/' + f)]);
run(process.execPath, ['scripts/ai/check-model-routing.mjs']);
run(process.execPath, ['scripts/ci/build-demo.mjs']);
