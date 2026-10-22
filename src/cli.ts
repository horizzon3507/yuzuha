#!/usr/bin/env node
import { main, formatCLIError } from './cli/main.js';

main().catch(error => {
  console.error(formatCLIError(error, ['check', 'doctor', 'lint', 'test', 'data', 'functions'].includes(process.argv[2] ?? '') && process.argv.includes('--json')));
  process.exitCode = 1;
});
