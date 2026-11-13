const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const roots = ['js'];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}

for (const root of roots) {
  if (fs.existsSync(root)) walk(root);
}

let failed = false;
for (const file of files.sort()) {
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
    process.stdout.write('OK  ' + file + '\n');
  } catch (error) {
    failed = true;
    process.stderr.write('FAIL ' + file + ': ' + error.message + '\n');
  }
}

if (failed) process.exitCode = 1;
else process.stdout.write('Syntax check passed for ' + files.length + ' JavaScript files.\n');
