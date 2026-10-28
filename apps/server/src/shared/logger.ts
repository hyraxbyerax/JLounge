/** 표준 출력으로 한 줄짜리 JSON 로그를 남긴다 (클라우드 로그 수집기가 그대로 읽는다) */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;
type Fields = Record<string, unknown>;

export type Logger = Record<LogLevel, (msg: string, fields?: Fields) => void> & {
  child: (fields: Fields) => Logger;
};

function serialize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  return value;
}

export function createLogger(minLevel: LogLevel = 'info', base: Fields = {}): Logger {
  const write =
    (level: LogLevel) =>
    (msg: string, fields: Fields = {}) => {
      if (LEVELS[level] < LEVELS[minLevel]) return;
      const entry: Fields = { time: new Date().toISOString(), level, msg, ...base };
      for (const [k, v] of Object.entries(fields)) entry[k] = serialize(v);
      const line = JSON.stringify(entry) + '\n';
      if (level === 'error') process.stderr.write(line);
      else process.stdout.write(line);
    };
  return {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    child: (fields) => createLogger(minLevel, { ...base, ...fields }),
  };
}
