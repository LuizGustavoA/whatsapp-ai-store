const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, '..');
const examplePath = path.join(backendDir, '.env.example');
const envPath = path.join(backendDir, '.env');

const parseEnv = (content) => {
  const map = new Map();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const index = line.indexOf('=');

    if (index === -1) {
      continue;
    }

    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1);

    map.set(key, value);
  }

  return map;
};

const exampleContent = fs.readFileSync(examplePath, 'utf8');
const currentContent = fs.readFileSync(envPath, 'utf8');
const currentValues = parseEnv(currentContent);
const exampleValues = parseEnv(exampleContent);

const output = [];

for (const line of exampleContent.split(/\r?\n/)) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) {
    output.push(line);
    continue;
  }

  const index = line.indexOf('=');

  if (index === -1) {
    output.push(line);
    continue;
  }

  const key = line.slice(0, index).trim();
  let value;

  if (key === 'CHAT_RESTRICT_OFF_TOPIC') {
    value = 'false';
  } else if (currentValues.has(key) && currentValues.get(key) !== '') {
    value = currentValues.get(key);
  } else {
    value = exampleValues.get(key) ?? '';
  }

  output.push(`${key}=${value}`);
}

for (const [key, value] of currentValues.entries()) {
  if (!exampleValues.has(key) && value !== '') {
    output.push(`${key}=${value}`);
  }
}

fs.writeFileSync(envPath, `${output.join('\n').replace(/\n?$/, '\n')}`);
console.log('OK: .env sincronizado com .env.example (valores existentes preservados)');
console.log('CHAT_RESTRICT_OFF_TOPIC=false');
