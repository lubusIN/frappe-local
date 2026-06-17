export type StatusContext = 'resource' | 'task' | 'diagnostic';

export const statusTheme = (status: string, context?: StatusContext) => {
  const normalized = status.toLowerCase();
  if (normalized === 'running') return context === 'resource' ? 'green' : 'blue';
  if (normalized === 'ready') return 'green';
  if (normalized === 'success' || normalized === 'passed' || normalized === 'ok') return 'green';
  if (normalized === 'failure' || normalized === 'failed' || normalized === 'error') return 'red';
  if (normalized === 'warning' || normalized === 'warn') return 'orange';
  if (normalized === 'queued') return 'blue';
  return 'gray';
};

export const formatStatus = (status: string, context?: StatusContext) => {
  const normalized = status.toLowerCase();
  
  if (normalized === 'running') return context === 'resource' ? 'Running' : 'In Progress';
  if (normalized === 'ready') return 'Ready';
  if (normalized === 'queued') return 'Queued';
  if (normalized === 'failure' || normalized === 'failed' || normalized === 'error') return 'Failed';
  if (normalized === 'success') return 'Success';
  if (normalized === 'ok' || normalized === 'passed') return 'Passed';
  if (normalized === 'warn' || normalized === 'warning') return 'Warning';
  
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
};

export const formatTime = (value: string | Date | number): string => {
  return new Date(value).toLocaleString();
};
