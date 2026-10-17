export type UpdateLogStatus = 'pending' | 'installing' | 'ok' | 'error';

export type UpdateLogItem = {
  name: string;
  status: UpdateLogStatus;
  message?: string;
};

export function logItem(name: string, status: UpdateLogStatus = 'pending', message?: string): UpdateLogItem {
  return message ? { name, status, message } : { name, status };
}
