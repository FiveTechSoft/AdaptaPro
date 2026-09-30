"""Offline contract check. No network, mailbox access, queue mutations or email."""
import json
from pathlib import Path

def main():
    root = Path(__file__).resolve().parents[1]
    workflow = (root / '.github/workflows/erp-mail-ci.yml').read_text()
    assert 'workflow_dispatch:' in workflow
    assert '\n  schedule:' not in workflow
    assert "CI_SEND_ENABLED: 'false'" in workflow
    assert 'secrets.' not in workflow
    print(json.dumps({'status':'prepared-not-operational','network':False,'send':False,
                      'missing':['offline OAuth consent','authenticated gateway and durable queue','Actions runner billing availability','owner approval of automated communication scope']}))
if __name__ == '__main__': main()
