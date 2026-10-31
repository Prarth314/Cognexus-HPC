import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readConfig } from './config.js';
import { openDatabase, migrate } from './db.js';
import { issueEnrollment, approveExistingAccount } from './enrollment.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const prompt = createInterface({ input: stdin, output: stdout });
const email = await prompt.question('Account email (verify ownership out of band first): ');
const approval = await prompt.question(
  'Type ISSUE to create a registration code, or APPROVE to approve an existing account: ',
);
prompt.close();
if (!['ISSUE', 'APPROVE'].includes(approval)) throw new Error('No account changes made');
const db = await openDatabase(readConfig());
try {
  await migrate(db);
  console.log(
    JSON.stringify(
      approval === 'ISSUE'
        ? await issueEnrollment(db, email)
        : await approveExistingAccount(db, email),
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
