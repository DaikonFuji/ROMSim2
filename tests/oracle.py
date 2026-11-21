"""ROM Solo's own server code as the reference: reads builds (JSON lines) on stdin, prints their attributes.

Usage: python tests/oracle.py "<ROM Solo folder>" < builds.jsonl
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from romsolo import stats, record, settle  # noqa: E402

ids = stats.var_ids()
names = {v: k for k, v in ids.items()}
fl = stats.float_ids()
for n, line in enumerate(sys.stdin):
    line = line.strip()
    if not line:
        continue
    b = json.loads(line)
    c = record(b, n)
    try:
        a = settle(c)
        out = {names.get(k, str(k)): (v / 1000.0 if k in fl else v) for k, v in a.items()}
    except Exception as e:
        import traceback
        out = {'error': traceback.format_exc()[-600:]}
    print(json.dumps(out))
    sys.stdout.flush()
