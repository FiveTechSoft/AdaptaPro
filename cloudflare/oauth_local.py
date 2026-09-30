"""Run ONLY on the owner's computer. Desktop OAuth + PKCE, tokens to Wrangler stdin.
No tokens, codes or client secrets are printed or stored by this helper.
"""
import base64, hashlib, http.server, json, os, pathlib, secrets, shutil, subprocess, sys, urllib.parse, urllib.request, webbrowser

def wrangler_command():
    npx = shutil.which('npx')
    if not npx:
        raise ValueError('npx not found. Install Node.js or reopen the terminal after installing it. No Google consent started.')
    if os.name == 'nt' or pathlib.Path(npx).suffix.lower() in ('.cmd', '.bat'):
        # Run npm's JS entrypoint directly, not a shell or .cmd launcher.
        # Secret values remain only on stdin.
        node = shutil.which('node')
        cli = pathlib.Path(npx).parent / 'node_modules' / 'npm' / 'bin' / 'npx-cli.js'
        if not node or not cli.is_file():
            raise ValueError('Node/npm launcher not found beside npx. Repair Node.js and reopen the terminal. No Google consent started.')
        return [node, str(cli), 'wrangler']
    return [npx, 'wrangler']

def load_safe_config():
    cfg = json.loads(pathlib.Path('wrangler.jsonc').read_text(encoding='utf-8-sig'))
    if cfg.get('name') != 'adaptapro-bridge':
        raise ValueError('Run in the reviewed adaptapro-bridge folder. No Google consent started.')
    if str(cfg.get('vars', {}).get('SEND_ENABLED', '')).lower() != 'false' or cfg.get('triggers', {}).get('crons') != []:
        raise ValueError('Set SEND_ENABLED to false and triggers.crons to [] before installing credentials. No Google consent started.')
    if not cfg.get('vars', {}).get('ERP_MAILBOX'):
        raise ValueError('ERP_MAILBOX missing. No Google consent started.')
    return cfg

def main():
    if len(sys.argv)!=2: raise ValueError('Pass the downloaded Desktop client JSON path (private file, never commit)')
    cfg=load_safe_config()
    command=wrangler_command()
    check=subprocess.run(command+['--version'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if check.returncode: raise ValueError('Wrangler could not start. Run npx wrangler --version in this terminal first. No Google consent started.')
    client=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8-sig')).get('installed')
    if not client or not client.get('client_id') or not client.get('client_secret'): raise ValueError('Desktop OAuth client JSON required, not Web GIS client')
    verifier=secrets.token_urlsafe(64)
    challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    state=secrets.token_urlsafe(32); result={}
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def do_GET(self):
            q=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            if q.get('state')!=[state] or not q.get('code') or q.get('error'):
                self.send_response(400);self.end_headers();self.wfile.write(b'Consent not completed.');return
            result['code']=q['code'][0]; self.send_response(200);self.end_headers();self.wfile.write(b'Consent received. Return to the terminal. No tokens shown here.')
    server=http.server.HTTPServer(('127.0.0.1',0),Handler);server.timeout=180
    redirect='http://127.0.0.1:'+str(server.server_port)
    auth='https://accounts.google.com/o/oauth2/v2/auth?'+urllib.parse.urlencode(dict(client_id=client['client_id'],redirect_uri=redirect,response_type='code',scope='https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',state=state,code_challenge=challenge,code_challenge_method='S256',access_type='offline',prompt='consent select_account'))
    print('Opening Google consent. Select ONLY the reviewed ERP mailbox. No code/token should be copied into chat.')
    if not webbrowser.open(auth): raise ValueError('Browser unavailable; run this helper on your own computer with a browser')
    server.handle_request();server.server_close()
    if not result.get('code'): raise ValueError('No consent code received within the window')
    data=urllib.parse.urlencode(dict(client_id=client['client_id'],client_secret=client['client_secret'],code=result['code'],code_verifier=verifier,redirect_uri=redirect,grant_type='authorization_code')).encode()
    with urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token',data=data),timeout=20) as r: token=json.load(r)
    if not token.get('refresh_token'): raise ValueError('Google did not return an offline refresh token; no secrets installed')
    req=urllib.request.Request('https://gmail.googleapis.com/gmail/v1/users/me/profile',headers={'Authorization':'Bearer '+token['access_token']})
    with urllib.request.urlopen(req,timeout=20) as r: profile=json.load(r)
    if profile.get('emailAddress')!=cfg['vars']['ERP_MAILBOX']: raise ValueError('Wrong Gmail account; no secrets installed')
    print('Verified ERP Gmail identity. Sending three private values directly to Wrangler; no mailbox messages sent.')
    for name,value in [('GOOGLE_CLIENT_ID',client['client_id']),('GOOGLE_CLIENT_SECRET',client['client_secret']),('GOOGLE_REFRESH_TOKEN',token['refresh_token'])]:
        completed=subprocess.run(command+['secret','put',name,'--config',str(pathlib.Path('wrangler.jsonc').resolve())],input=value+'\n',text=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if completed.returncode: raise ValueError('Secret upload failed; already stored entries may remain; check names only in Cloudflare')
    print('Offline credentials installed. Send/cron remain disabled. Securely remove downloaded credential JSON if no longer needed.')

if __name__=='__main__':
    try: main()
    except Exception as exc:
        if isinstance(exc,ValueError): print(str(exc))
        else: print('Consent/setup stopped ('+type(exc).__name__+'); no secret values printed.')
        raise SystemExit(1)
