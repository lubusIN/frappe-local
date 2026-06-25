import { spawnSync } from 'node:child_process';

console.log('Running typecheck for renderer...');
const result = spawnSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.renderer.json'], { 
  encoding: 'utf-8',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error('Failed to start tsc:', result.error);
  process.exit(1);
}

if (result.status !== 0) {
  const output = (result.stdout || '') + (result.stderr || '');
  const lines = output.split('\n');
  const actualErrors = [];
  
  let currentError = [];
  let isFrappeUiError = false;

  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Check if line starts a new error
    const isNewError = /error TS[0-9]+:/.test(line);
    
    if (isNewError) {
      if (currentError.length > 0 && !isFrappeUiError) {
        actualErrors.push(...currentError);
      }
      currentError = [line];
      isFrappeUiError = line.includes('node_modules/frappe-ui');
    } else {
      if (currentError.length > 0) {
        currentError.push(line);
      }
    }
  }
  
  if (currentError.length > 0 && !isFrappeUiError) {
    actualErrors.push(...currentError);
  }

  if (actualErrors.length > 0) {
    console.error(actualErrors.join('\n'));
    process.exit(1);
  }
}

console.log('Renderer typecheck passed successfully (ignored node_modules/frappe-ui errors).');
