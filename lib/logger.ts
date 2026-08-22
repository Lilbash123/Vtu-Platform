type LogLevel = 'info' | 'warn' | 'error';

interface LogFields {
  route: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields: LogFields) {
  const entry = { level, message, timestamp: new Date().toISOString(), ...fields };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields: LogFields) => emit('info', message, fields),
  warn: (message: string, fields: LogFields) => emit('warn', message, fields),
  error: (message: string, fields: LogFields) => emit('error', message, fields),
};
