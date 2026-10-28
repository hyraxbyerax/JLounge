// npm run dev — 화면(web)과 서버(server)를 함께 띄운다. 한쪽이 죽으면 둘 다 끈다.
import { spawn } from 'node:child_process';

const apps = [
  { name: 'server', workspace: '@lounge/server' },
  { name: 'web', workspace: '@lounge/web' },
];

const children = apps.map(({ name, workspace }) => {
  // Windows에서는 npm이 npm.cmd라 셸로 실행한다 (명령을 한 문자열로 넘겨야 경고가 없다)
  const child = spawn(`npm run dev -w ${workspace}`, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
  const prefix = `[${name}] `;
  const relay = (stream, out) => {
    let rest = '';
    stream.on('data', (chunk) => {
      const lines = (rest + chunk).split(/\r?\n/);
      rest = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);
  child.on('exit', (code) => {
    process.stdout.write(`${prefix}종료 (코드 ${code})\n`);
    stopAll();
    process.exitCode ||= code ?? 0;
  });
  return child;
});

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
