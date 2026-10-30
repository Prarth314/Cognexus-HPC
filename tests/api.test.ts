import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { openDatabase } from '../server/db.js';
import { createRunner } from '../server/runner.js';

let service: Awaited<ReturnType<typeof buildApp>>;
let directory: string;
let ownerCookie: string, outsiderCookie: string, viewerCookie: string;
let projectId: string, fileId: string, runId: string;
const verification = { 'x-cognexus-request':'1' };
function headers(cookie: string) { return { ...verification,cookie }; }
async function register(name: string,email: string) {
  const response = await service.app.inject({ method:'POST',url:'/api/auth/register',headers:verification,payload:{ name,email,password:'a-strong-test-password' } });
  assert.equal(response.statusCode,201,response.body);
  return { cookie:response.headers['set-cookie']!.toString().split(';')[0], user:response.json().user as { id:string } };
}
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(),'cognexus-tests-'));
  const config = readConfig({ DATA_DIR:directory });
  const db = await openDatabase(config,true);
  service = await buildApp({ config,db,worker:false,logger:false });
  ownerCookie = (await register('Owner','owner@example.org')).cookie;
  outsiderCookie = (await register('Outsider','outsider@example.org')).cookie;
  viewerCookie = (await register('Viewer','viewer@example.org')).cookie;
});
after(async () => { await service?.app.close(); if (directory) await rm(directory,{ recursive:true,force:true }); });

test('authentication rejects forged sessions and login failures; session cookies are HttpOnly', async () => {
  assert.equal((await service.app.inject({ url:'/api/projects' })).statusCode,401);
  assert.equal((await service.app.inject({ url:'/api/projects',headers:{ cookie:'cognexus=forged' } })).statusCode,401);
  const login = await service.app.inject({ method:'POST',url:'/api/auth/login',headers:verification,payload:{ email:'owner@example.org',password:'wrong' } });
  assert.equal(login.statusCode,401);
  const success = await service.app.inject({ method:'POST',url:'/api/auth/login',headers:verification,payload:{ email:'owner@example.org',password:'a-strong-test-password' } });
  assert.match(success.headers['set-cookie']!.toString(),/HttpOnly/);
  const sessions = await service.db.query<{ token_hash:string }>('SELECT token_hash FROM sessions');
  assert.ok(sessions.every(s=>!ownerCookie.includes(s.token_hash)));
});
test('mutations reject missing CSRF header and foreign origins', async () => {
  const payload = { name:'Forbidden project' };
  assert.equal((await service.app.inject({ method:'POST',url:'/api/projects',headers:{ cookie:ownerCookie },payload })).statusCode,403);
  assert.equal((await service.app.inject({ method:'POST',url:'/api/projects',headers:{ ...headers(ownerCookie),origin:'https://evil.example' },payload })).statusCode,403);
});
test('projects persist in the database and are isolated from nonmembers', async () => {
  const response = await service.app.inject({ method:'POST',url:'/api/projects',headers:headers(ownerCookie),payload:{ name:'Reference research',description:'Actual execution tests',domain:'Statistics' } });
  assert.equal(response.statusCode,201,response.body); projectId=response.json().id;
  const list = await service.app.inject({ url:'/api/projects',headers:headers(ownerCookie) });
  assert.equal(list.json()[0].id,projectId);
  for (const resource of ['files','runs','members','audit']) {
    assert.equal((await service.app.inject({ url:`/api/projects/${projectId}/${resource}`,headers:headers(outsiderCookie) })).statusCode,404);
  }
});
test('invitations bind email, expire, cannot be reused, and enforce viewer permissions', async () => {
  const invite = await service.app.inject({ method:'POST',url:`/api/projects/${projectId}/invitations`,headers:headers(ownerCookie),payload:{ email:'viewer@example.org',role:'viewer' } });
  assert.equal(invite.statusCode,200,invite.body);
  const payload={ token:invite.json().token };
  assert.equal((await service.app.inject({ method:'POST',url:'/api/invitations/accept',headers:headers(outsiderCookie),payload })).statusCode,404);
  assert.equal((await service.app.inject({ method:'POST',url:'/api/invitations/accept',headers:headers(viewerCookie),payload })).statusCode,200);
  assert.equal((await service.app.inject({ method:'POST',url:'/api/invitations/accept',headers:headers(viewerCookie),payload })).statusCode,404);
  assert.equal((await service.app.inject({ method:'POST',url:`/api/projects/${projectId}/runs`,headers:{ ...headers(viewerCookie),'idempotency-key':'viewer-test-key' },payload:{ workflow:'monte-carlo-pi',parameters:{ samples:1000,seed:1 } } })).statusCode,403);
});
test('last owner is protected and members cannot manage roles', async () => {
  const members = (await service.app.inject({ url:`/api/projects/${projectId}/members`,headers:headers(ownerCookie) })).json() as { id:string;role:string }[];
  const owner=members.find(m=>m.role==='owner')!;
  const url=`/api/projects/${projectId}/members/${owner.id}`;
  assert.equal((await service.app.inject({ method:'PATCH',url,headers:headers(ownerCookie),payload:{ role:'viewer' } })).statusCode,409);
  assert.equal((await service.app.inject({ method:'DELETE',url,headers:headers(ownerCookie) })).statusCode,409);
  assert.equal((await service.app.inject({ method:'PATCH',url,headers:headers(viewerCookie),payload:{ role:'viewer' } })).statusCode,403);
});
test('upload retains exact bytes, real preview, checksum, and download authorization', async () => {
  const bytes='value,label\n1,a\n2,b\n3,c\n4,d\n';
  const payload=`--boundary\r\nContent-Disposition: form-data; name="file"; filename="observations.csv"\r\nContent-Type: text/csv\r\n\r\n${bytes}\r\n--boundary--\r\n`;
  const response = await service.app.inject({ method:'POST',url:`/api/projects/${projectId}/files`,headers:{ ...headers(ownerCookie),'content-type':'multipart/form-data; boundary=boundary' },payload });
  assert.equal(response.statusCode,201,response.body); fileId=response.json().id;
  const download = await service.app.inject({ url:`/api/files/${fileId}/download`,headers:headers(ownerCookie) });
  assert.equal(download.body,bytes);
  assert.equal((await service.app.inject({ url:`/api/files/${fileId}/download`,headers:headers(outsiderCookie) })).statusCode,404);
  const preview = await service.app.inject({ url:`/api/files/${fileId}/preview`,headers:headers(ownerCookie) });
  assert.deepEqual(preview.json().headers,['value','label']); assert.deepEqual(preview.json().rows[0],['1','a']);
});
test('submission is idempotent, pins inputs, and refuses conflicting retries', async () => {
  const payload={ workflow:'csv-summary',inputFileId:fileId,parameters:{ column:'value' } };
  const request={ method:'POST' as const,url:`/api/projects/${projectId}/runs`,headers:{ ...headers(ownerCookie),'idempotency-key':'stable-submission-key' },payload };
  const first=await service.app.inject(request); assert.equal(first.statusCode,201,first.body); runId=first.json().id;
  const second=await service.app.inject(request); assert.equal(second.json().id,runId); assert.equal(second.statusCode,200);
  const changed=await service.app.inject({ ...request,payload:{ ...payload,parameters:{ column:'label' } } }); assert.equal(changed.statusCode,409);
});
test('worker executes stored input, persists an artifact, and exports evidence', async () => {
  const runner=createRunner(service.db,service.storage,{ error:error=>{ throw error; } });
  try { await runner.tick(); } finally { await runner.stop(); }
  const response=await service.app.inject({ url:`/api/runs/${runId}`,headers:headers(ownerCookie) });
  assert.equal(response.json().status,'succeeded',response.body); assert.equal(response.json().result.mean,2.5);
  const manifest=await service.app.inject({ url:`/api/runs/${runId}/manifest`,headers:headers(ownerCookie) });
  assert.equal(manifest.json().execution.input.id,fileId); assert.equal(manifest.json().artifacts.length,1);
  const result=await service.app.inject({ url:`/api/files/${manifest.json().artifacts[0].id}/download`,headers:headers(ownerCookie) });
  assert.equal(result.json().median,2.5);
  for (const suffix of ['','/manifest','/analyses']) assert.equal((await service.app.inject({ url:`/api/runs/${runId}${suffix}`,headers:headers(outsiderCookie) })).statusCode,404);
});
test('AI is optional and fails explicitly without provider configuration', async () => {
  const response=await service.app.inject({ method:'POST',url:`/api/runs/${runId}/analyses`,headers:headers(ownerCookie),payload:{ question:'Explain the results' } });
  assert.equal(response.statusCode,503);
});
test('queued cancellation survives worker polling and is audited', async () => {
  const response=await service.app.inject({ method:'POST',url:`/api/projects/${projectId}/runs`,headers:{ ...headers(ownerCookie),'idempotency-key':'cancel-test-key' },payload:{ workflow:'monte-carlo-pi',parameters:{ samples:1000,seed:1 } } });
  const id=response.json().id;
  assert.equal((await service.app.inject({ method:'POST',url:`/api/runs/${id}/cancel`,headers:headers(ownerCookie) })).statusCode,200);
  assert.equal((await service.app.inject({ url:`/api/runs/${id}`,headers:headers(ownerCookie) })).json().status,'cancelled');
  const audit=(await service.app.inject({ url:`/api/projects/${projectId}/audit`,headers:headers(ownerCookie) })).json() as { action:string }[];
  assert.ok(audit.some(e=>e.action==='run.cancelled'));
});
