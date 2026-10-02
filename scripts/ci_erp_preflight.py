"""Offline contract check. No network, mailbox access, queue mutations or email."""
import json
from pathlib import Path

def main():
    root = Path(__file__).resolve().parents[1]
    workflows = sorted((root / '.github/workflows').glob('*.yml'))
    assert workflows, 'no hay workflows en .github/workflows'
    for wf in workflows:
        text = wf.read_text(encoding='utf-8')
        assert any(t in text for t in ('workflow_dispatch:', 'pull_request:', 'push:')), wf.name
        assert '\n  schedule:' not in text, wf.name
        assert 'secrets.' not in text, wf.name
        assert 'gmail' not in text.lower(), wf.name
        assert 'SEND_ENABLED' not in text, wf.name
    print(json.dumps({'status':'prepared-not-operational','network':False,'send':False,
                      'workflows':[w.name for w in workflows],
                      'missing':['offline OAuth consent','authenticated gateway and durable queue','Actions runner billing availability','owner approval of automated communication scope']}))
if __name__ == '__main__': main()
