import { writeFileSync, chmodSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const script = `#!/bin/bash
echo "Hello from terminal!"
sleep 2
`;
const file = join(tmpdir(), 'test-term.command');
writeFileSync(file, script);
chmodSync(file, '755');
execSync(`open "${file}"`);
