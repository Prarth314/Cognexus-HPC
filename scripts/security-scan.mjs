// Offline, redacted heuristic scan. Never prints matching content or credentials.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  [
    'provider-token',
    /\b(?:sk-(?:or-v1-|proj-)?[a-zA-Z0-9_-]{28,}|gh[pousr]_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{30,}|AIza[a-zA-Z0-9_-]{30,}|AKIA[A-Z0-9]{16})\b/g,
  ],
  [
    'credential-url',
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s'"<>:@]+:([^\s'"<>@]{8,})@/g,
  ],
];
function git(args, input) {
  const result = spawnSync('git', args, { input, encoding: null, maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Git inspection failed; scan incomplete');
  return result.stdout;
}
const refs = git(['rev-list', '--objects', '--all']).toString('utf8').trim().split('\n');
const objects = new Map(
  refs.filter(Boolean).map((line) => {
    const space = line.indexOf(' ');
    return [
      space < 0 ? line : line.slice(0, space),
      space < 0 ? '(metadata)' : line.slice(space + 1),
    ];
  }),
);
// Include the staged/index versions as well as all reachable history.
for (const line of git(['ls-files', '--stage']).toString('utf8').trim().split('\n')) {
  const match = /^\d+ ([a-f0-9]+) \d+\t(.*)$/.exec(line);
  if (match) objects.set(match[1], match[2]);
}
const output = git(['cat-file', '--batch'], [...objects.keys()].join('\n') + '\n');
const findings = [];
let offset = 0,
  blobs = 0;
function inspect(text, metadata) {
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (
        kind === 'credential-url' &&
        ['ci-only-password', 'replace-me', 'replace-with-a-password'].includes(match[1])
      )
        continue;
      findings.push({
        ...metadata,
        kind,
        line: text.slice(0, match.index).split('\n').length,
        fingerprint: createHash('sha256').update(match[0]).digest('hex').slice(0, 12),
      });
    }
  }
}
while (offset < output.length) {
  const end = output.indexOf(10, offset);
  if (end < 0) throw new Error('Incomplete Git object stream');
  const [hash, type, sizeText] = output.subarray(offset, end).toString('utf8').split(' '),
    size = Number(sizeText);
  if (!Number.isSafeInteger(size) || size < 0 || end + 1 + size >= output.length)
    throw new Error('Invalid Git object stream');
  const content = output.subarray(end + 1, end + 1 + size);
  offset = end + size + 2;
  if (!['blob', 'commit', 'tag'].includes(type) || content.includes(0)) continue;
  if (type === 'blob') blobs++;
  inspect(content.toString('utf8'), { path: objects.get(hash), object: hash.slice(0, 12) });
}
let workingFiles = 0;
for (const filename of git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  .toString('utf8')
  .split('\0')
  .filter(Boolean)) {
  let stat;
  try {
    stat = lstatSync(filename);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) continue;
  if (stat.size > 20 * 1024 * 1024)
    throw new Error('Working file exceeds scan bound; manual inspection required');
  const content = readFileSync(filename);
  if (content.includes(0)) continue;
  workingFiles++;
  inspect(content.toString('utf8'), { path: filename, object: 'working-tree' });
}
console.log(
  JSON.stringify(
    {
      scope: 'Working tree, Git index, and all reachable history; ignored runtime secrets excluded',
      textBlobs: blobs,
      workingFiles,
      findings,
    },
    null,
    2,
  ),
);
if (findings.length) process.exitCode = 1;
