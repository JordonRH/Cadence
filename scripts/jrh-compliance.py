#!/usr/bin/env python3
"""JRH deployment gate. Never emits config values, health output, or raw errors."""
import argparse
import datetime as dt
import json
from pathlib import Path
import re
import subprocess
import sys

BASE = Path('/home/jbox/Documents/ChatGPT/Linux general')
FORMAT = '''{"name":{{json .Name}},"restart":{{json .HostConfig.RestartPolicy.Name}},"state":{{json .State.Status}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"none"{{end}},"healthcheck":{{if .Config.Healthcheck}}{{if .Config.Healthcheck.Test}}{{if eq (index .Config.Healthcheck.Test 0) "NONE"}}false{{else}}true{{end}}{{else}}false{{end}}{{else}}false{{end}},"autoheal":{{json (index .Config.Labels "autoheal")}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"compose_files":{{json (index .Config.Labels "com.docker.compose.project.config_files")}},"networks":[{{range $name,$settings := .NetworkSettings.Networks}}{{json $name}},{{end}}null],"mounts":[{{range .Mounts}}{"type":{{json .Type}},"destination":{{json .Destination}}},{{end}}null]}'''
FILES = ['JGym/compose.jgym.yml','JGym/compose.deploy-runner.yml','Cadence/compose.yml','Cadence/compose.runner.yml','hearth-and-spoon/compose.yml','hearth-and-spoon/compose.runner.yml','boxgame/compose.yml','boxgame/compose.updater.yml','career-vault/compose.yml','ai-newsroom/compose.yml','monitoring/docker-compose.yml','vaultwarden/compose.yaml','jrh-dashboard/compose.yml','/home/jbox/actleave-fit-89a/compose.yaml']


def docker(*args):
    result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=40)
    if result.returncode:
        raise RuntimeError('Docker operation failed; diagnostic output withheld')
    return result.stdout.strip()


def health_valid(check):
    if not isinstance(check, dict) or check.get('disable'):
        return False
    test = check.get('test')
    if isinstance(test, list):
        if not test or test[0] == 'NONE':
            return False
        command = ' '.join(str(x) for x in test[1:] if x is not None).strip()
    else:
        command = str(test or '').strip()
    return bool(command) and command not in {'true', 'exit 0', '/bin/true', ':'}


def labels_of(service):
    labels = service.get('labels') or {}
    if isinstance(labels, list):
        return dict(x.split('=', 1) if '=' in x else (x, '') for x in labels)
    return labels if isinstance(labels, dict) else {}


def image_health(image):
    if not isinstance(image, str) or not re.fullmatch(r'[A-Za-z0-9_./:@-]+', image):
        return False
    fmt = '{{if .Config.Healthcheck}}{{if .Config.Healthcheck.Test}}{{if eq (index .Config.Healthcheck.Test 0) "NONE"}}false{{else}}true{{end}}{{else}}false{{end}}{{else}}false{{end}}'
    try:
        return docker('image', 'inspect', '--format', fmt, image) == 'true'
    except Exception:
        return False


def inspect_service(service, selector='all', inherited_health=False):
    errors, warnings = [], []
    if service.get('restart') != 'unless-stopped':
        errors.append('restart: must be unless-stopped')
    check = service.get('healthcheck')
    healthy = health_valid(check) if check is not None else inherited_health
    if not healthy:
        errors.append('healthcheck: missing, disabled, trivial, or image inheritance unverified')
    labels = labels_of(service)
    if selector != 'all' and str(labels.get(selector, '')).lower() != 'true':
        errors.append('autoheal: required selector label is missing')
    if selector == 'all' and str(labels.get('autoheal', '')).lower() != 'true':
        warnings.append('autoheal=true label absent; selected by current all policy only')
    ports = service.get('ports') or []
    for port in ports:
        if isinstance(port, str) and (not port.startswith('127.0.0.1:') and not port.startswith('[::1]:')):
            errors.append('ports: localhost binding absent or cannot be verified without resolving deployment variables')
            break
        if isinstance(port, dict) and port.get('published') and port.get('host_ip') not in {'127.0.0.1','::1'}:
            errors.append('ports: localhost binding absent or cannot be verified without resolving deployment variables')
            break
    for mount in service.get('volumes') or []:
        destination = mount.get('target','') if isinstance(mount, dict) else str(mount).split(':')[1] if ':' in str(mount) else ''
        if destination == '/var/run/docker.sock':
            warnings.append('privileged Docker socket consumer: verify existing runner/updater exception')
    return errors, warnings


def load_compose(filename):
    try:
        import yaml
        data = yaml.safe_load(Path(filename).read_text())
        if not isinstance(data,dict) or not isinstance(data.get('services'),dict):
            raise ValueError()
        if any(k in data for k in ['include','extends']):
            raise ValueError()
        return data
    except Exception:
        raise RuntimeError('Cannot safely validate Compose input; content and parser errors withheld') from None


def compose_results(filename, selector, use_images=True):
    doc = load_compose(filename)
    results = []
    for name, service in doc['services'].items():
        if not isinstance(service,dict):
            raise RuntimeError('Unsupported service structure')
        if re.search('cloudflared|tunnel',name,re.I) or 'cloudflared' in str(service.get('image','')):
            results.append({'service':name,'status':'operator-only','errors':['tunnel service requires operator verification'],'warnings':[]})
            continue
        if service.get('profiles') or service.get('extends'):
            results.append({'service':name,'status':'fail','errors':['profile/extends service requires explicit separate validation'],'warnings':[]})
            continue
        inherited = image_health(service.get('image')) if use_images and 'healthcheck' not in service else False
        errors,warnings = inspect_service(service,selector,inherited)
        results.append({'service':name,'status':'fail' if errors else 'pass','errors':errors,'warnings':warnings})
    if not results:
        raise RuntimeError('No services to validate')
    return results


def controller_selector():
    # Approved selector key only; never retrieve or display the full environment.
    fmt = '{{range .Config.Env}}{{if eq (index (split . "=") 0) "AUTOHEAL_CONTAINER_LABEL"}}{{println .}}{{end}}{{end}}'
    value = docker('inspect','--format',fmt,'docker-autoheal')
    if not value:
        return 'autoheal'
    value = value.removeprefix('AUTOHEAL_CONTAINER_LABEL=').strip()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+',value):
        raise RuntimeError('Invalid autoheal selector; value withheld')
    return value


def inventory():
    names=docker('ps','-a','--format','{{.Names}}').splitlines()
    # Exclude tunnel containers without inspecting their settings.
    names=[name for name in names if not re.search('cloudflared|tunnel',name,re.I)]
    if not names:return []
    return [json.loads(line) for line in docker('inspect','--format',FORMAT,*names).splitlines()]


def runtime_results(rows,selector):
    results=[]
    for row in rows:
        errors,warnings=[],[]
        if row['state'] != 'running':
            if row['name'].lstrip('/') == 'docker-autoheal':
                errors.append('autoheal controller is not running')
                status='fail'
            else:
                status='excluded-stopped'
        else:
            if row['restart'] != 'unless-stopped':errors.append('restart policy is not unless-stopped')
            if row.get('service') in {'db','redis','mariadb','postgres','postgresql'} and 'aitrace_proxy' in row.get('networks',[]):errors.append('backend data service is attached to shared ingress network')
            if not row['healthcheck']:errors.append('no active health check')
            if row['health'] not in {'healthy','none'}:errors.append('health state is not healthy')
            if row['name'].lstrip('/') != 'docker-autoheal':
                if selector != 'all':
                    # Only the normal approved label is read from other containers.
                    if selector != 'autoheal':errors.append('custom selector coverage unverified; inspect only that label with permission')
                    elif str(row['autoheal']).lower() != 'true':errors.append('not selected by autoheal')
                elif str(row['autoheal']).lower() != 'true':warnings.append('covered by all selector; no portable opt-in label')
            status='fail' if errors else 'pass'
        results.append({**row,'status':status,'errors':errors,'warnings':warnings})
    return results


def public_status(url):
    parsed = __import__('urllib.parse',fromlist=['urlparse']).urlparse(url)
    if parsed.scheme != 'https' or not (parsed.hostname or '').endswith('.jrhtechservices.party') or parsed.username or parsed.password or parsed.query or parsed.fragment:
        return {'head':'unverified','get':'unverified'}
    # Use the same Node fetch client as the independently verified host probe.
    # Only public catalogue URLs enter this source; no shell interpolation is used.
    script = "const url="+json.dumps(url)+";"+"""
const result={};
for(const method of ['HEAD','GET']) {
  try {
    const response=await fetch(url,{method,redirect:'manual',signal:AbortSignal.timeout(8000)});
    result[method.toLowerCase()]=response.status;
    await response.body?.cancel();
  } catch {result[method.toLowerCase()]='unverified';}
  if(method==='HEAD'&&Number.isInteger(result.head)&&result.head>=200&&result.head<300)break;
}
console.log(JSON.stringify(result));
"""
    try:
        result=subprocess.run(['node','--input-type=module','-'],input=script,capture_output=True,text=True,timeout=22)
        data=json.loads(result.stdout)
        if result.returncode or not isinstance(data,dict):raise ValueError()
        return {key:value for key,value in data.items() if key in {'head','get'} and (isinstance(value,int) or value=='unverified')}
    except Exception:
        return {'head':'unverified','get':'unverified'}


def audit(output,approved_sources):
    selector=controller_selector()
    rows=runtime_results(inventory(),selector)
    source=[]
    if approved_sources:
        for filename in FILES:
            full=Path(filename) if Path(filename).is_absolute() else BASE/filename
            try: entries=compose_results(full,selector)
            except RuntimeError:entries=[{'service':'unknown','status':'fail','errors':['source validation unavailable; content withheld'],'warnings':[]}]
            source.append({'file':filename,'services':entries})
    dashboard=json.loads((BASE/'jrh-dashboard/apps.json').read_text())
    destinations=[{'id':a['id'],'url':a['url'],**public_status(a['url'])} for a in dashboard]
    boot={}
    for unit in ['docker.service','pihole-FTL.service','jtlinuxbox-startup.service']:
        result=subprocess.run(['systemctl','is-enabled',unit],capture_output=True,text=True)
        boot[unit]=result.stdout.strip() if result.stdout.strip() in {'enabled','disabled','not-found','masked','static','indirect'} else 'unverified'
    report={'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'autoheal_selector':selector,'boot':boot,'runtime':rows,'sources':source,'dashboard':destinations,'pending':['Tunnel verification is operator-only.','Health-check semantics, actual backup restoration, and phone layout need application-specific review.','No failure injection or host reboot was performed.','No deployment route outside the hooked scripts is enforced automatically.']}
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    (output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    lines=['# JRH app compliance audit','',f"Checked: {report['checked_at']}",'',f'Autoheal selector: `{selector}`. Missing opt-in labels do not exclude containers while this selector is `all`.','', '| Container | Restart | Health | Result | Findings |','| --- | --- | --- | --- | --- |']
    for row in rows:
        lines.append(f"| {row['name'].lstrip('/')} | {row['restart']} | {row['health']} | {row['status']} | {'; '.join(row['errors']+row['warnings']) or ('Stopped legacy container; not assessed or restarted' if row['status']=='excluded-stopped' else 'Required runtime signals present')} |")
    lines+=['','## Production sources','']
    for item in source:
        lines.append(f"- `{item['file']}`")
        for entry in item['services']:
            lines.append(f"  - `{entry['service']}`: **{entry['status']}** — {'; '.join(entry['errors']+entry['warnings']) or 'Policy fields verified'}")
    lines+=['','## Dashboard destinations','']+[f"- `{a['id']}`: HEAD {a['head']}"+(f"; GET {a['get']}" if 'get' in a else '') for a in destinations]+['','HEAD-only failures are not treated as broken routes when GET succeeds.','', '## Boot services','']+[f'- `{unit}`: {state}' for unit,state in boot.items()]
    lines+=['','## Limits and outstanding checks','']+['- '+s for s in report['pending']]
    (output/'REPORT.md').write_text('\n'.join(lines)+'\n')
    counts={state:sum(r['status']==state for r in rows) for state in ['pass','fail','excluded-stopped']}
    source_failures=sum(entry['status'] != 'pass' for item in source for entry in item['services'])
    boot_failed=any(boot[unit]!='enabled' for unit in ['docker.service','pihole-FTL.service'])
    dashboard_failed=any(not isinstance(item.get('get',item['head']),int) or not 200<=item.get('get',item['head'])<300 for item in destinations)
    print(json.dumps({'runtime':counts,'source_checks_not_passed':source_failures,'dashboard_http_ok':not dashboard_failed,'boot_ok':not boot_failed,'autoheal_selector':selector,'report':str(output/'REPORT.md')}))
    return 1 if counts['fail'] or source_failures or boot_failed or dashboard_failed else 0


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest='command',required=True)
    pre=commands.add_parser('preflight',help='Read explicitly approved Compose sources; fail closed before deploying')
    pre.add_argument('--compose',action='append',required=True)
    pre.add_argument('--selector',required=True,help='Verified controller selector, or live to read only the approved controller selector key')
    pre.add_argument('--approved-config',action='store_true',help='Caller has obtained source-specific inspection permission')
    au=commands.add_parser('audit',help='Read metadata plus the specifically approved controller selector key')
    au.add_argument('--output',default=str(BASE/'ops-compliance/latest'))
    au.add_argument('--approved-sources',action='store_true')
    args=parser.parse_args()
    try:
        if args.command=='audit':return audit(args.output,args.approved_sources)
        if not args.approved_config:
            print('BLOCKED: obtain source-specific inspection permission before reading deployment configuration.')
            return 2
        selector = controller_selector() if args.selector == 'live' else args.selector
        failed=False
        for filename in args.compose:
            result=compose_results(filename,selector)
            for entry in result:
                # Do not print any configuration values, image commands or parser diagnostics.
                print(json.dumps({'file':str(filename),**entry}))
                failed=failed or entry['status'] != 'pass'
        return 1 if failed else 0
    except Exception:
        print('BLOCKED: validation could not complete; potentially sensitive diagnostics withheld.',file=sys.stderr)
        return 2

if __name__=='__main__':sys.exit(main())
