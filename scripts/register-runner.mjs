// Operator-run registration. Never print API responses, registration material,
// runner diagnostics, environment variables or command-line credentials.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
try {
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
mkdirSync('deploy-runner-state',{recursive:true,mode:0o700});
const env = { ...process.env, DOCKER_SOCKET_GID: String(statSync('/var/run/docker.sock').gid) };
const compose = ['compose','-f','compose.runner.yml'];
function run(args, options={}) {
  const r = spawnSync('docker',args,{env,stdio:['pipe','pipe','pipe'],...options});
  if(r.status !== 0) throw new Error('Runner setup failed. Sensitive diagnostics were suppressed; do not paste credential-bearing output.');
}
run([...compose,'build']);
const metadata = JSON.parse(execFileSync('gh',['api','repos/JordonRH/Cadence/actions/runners'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if (!metadata.runners.some(r=>r.name === 'cadence-deploy')) {
  const registration = JSON.parse(execFileSync('gh',['api','--method','POST','repos/JordonRH/Cadence/actions/runners/registration-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  run([...compose,'run','--rm','-T','runner','register'],{input:registration.token+'\n'});
}
run([...compose,'up','-d','--no-build']);
execFileSync('gh',['variable','set','CADENCE_DEPLOY_ENABLED','--repo','JordonRH/Cadence','--body','true'],{stdio:['ignore','pipe','pipe']});
execFileSync('gh',['workflow','run','cadence.yml','--repo','JordonRH/Cadence'],{stdio:['ignore','pipe','pipe']});
console.log('Cadence runner started. Automatic deployment enabled and verification requested.');
} catch {
  console.error('Runner setup did not complete. Sensitive diagnostics were suppressed. Check Docker access and GitHub authentication locally.');
  process.exitCode = 1;
}
