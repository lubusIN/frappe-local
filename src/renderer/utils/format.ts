export const statusTheme = (status: string) => {
  if (status === 'running') return 'blue';
  if (status === 'success' || status === 'passed' || status === 'ok') return 'green';
  if (status === 'failure' || status === 'error') return 'red';
  if (status === 'warning' || status === 'warn') return 'orange';
  if (status === 'queued') return 'blue';
  return 'gray';
};

export const formatStatus = (status: string) => {
  if (status === 'ok') return 'Passed';
  if (status === 'warn') return 'Warning';
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
};

export const formatTime = (value: string | Date | number): string => {
  return new Date(value).toLocaleString();
};
