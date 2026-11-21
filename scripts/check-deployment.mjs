const base = 'http://127.0.0.1:8099';
try {
  const health = await fetch(base+'/api/health',{signal:AbortSignal.timeout(3000)});
  const data = await health.json();
  if (!health.ok || data.service !== 'cadence' || (process.argv[2] && data.revision !== process.argv[2])) throw new Error();
  const protectedPage = await fetch(base+'/api/me',{signal:AbortSignal.timeout(3000)});
  if (protectedPage.status !== 401) throw new Error();
  const asset = await fetch(base+'/assets/echo.png',{signal:AbortSignal.timeout(3000)});
  if (!asset.ok) throw new Error();
  const metadata=await fetch(base+'/.well-known/oauth-protected-resource/mcp/',{signal:AbortSignal.timeout(3000)});
  if(!metadata.ok || (await metadata.json()).resource !== 'https://learning.jrhtechservices.party/mcp/') throw new Error();
  const mcp=await fetch(base+'/mcp/',{signal:AbortSignal.timeout(3000)});
  if(mcp.status !== 401 || !mcp.headers.get('www-authenticate')?.includes('resource_metadata')) throw new Error();
  const discovery=await fetch(base+'/mcp/',{
    method:'POST',
    headers:{Accept:'application/json, text/event-stream','Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}),
    signal:AbortSignal.timeout(3000)
  });
  if(!discovery.ok) throw new Error();
  const tools=(await discovery.json()).result?.tools;
  if(!tools?.some(tool=>tool.name==='save_lesson' && tool._meta?.securitySchemes?.some(scheme=>scheme.type==='oauth2'))) throw new Error();
} catch { process.exitCode = 1; }
