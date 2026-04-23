function _log(level: string, msg: string): void {
  const ts = new Date().toISOString();
  process.stderr.write(`${ts} [${level}] ${msg}\n`);
}

export const logger = {
  info(msg: string): void { _log('INFO', msg); },
  error(msg: string): void { _log('ERROR', msg); },
};
