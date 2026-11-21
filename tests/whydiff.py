import sys, json
a, b = sys.stdin.read().split('----')
s = json.loads(a); j = json.loads(b)
keys = sys.argv[1].split(',') if len(sys.argv) > 1 else None
print('learned only server:', {k: v for k, v in s['learned'].items() if j['learned'].get(k) != v})
print('learned only sim   :', {k: v for k, v in j['learned'].items() if s['learned'].get(k) != v})
for k, v in s.items():
    if k == 'learned' or not isinstance(v, dict): continue
    v = {x: y for x, y in v.items() if y and (not keys or x in keys)}
    if v: print('S', k, v)
for k, v in j['parts'].items():
    v = {x: y for x, y in v.items() if y and (not keys or x in keys)}
    if v: print('J', k, v)
