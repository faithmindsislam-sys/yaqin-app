"""Validate the title-only curriculum plan before database publication."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'api'))
from app.contracts.lesson import CourseDraft, contract_fields
from app.contracts.curriculum import Module, Subject, Level
from app.domain.courses import validate_classification
root = Path(__file__).parent
p = json.loads((root / 'plan.json').read_text())
b = json.loads((root / 'before.json').read_text())
courses = {l['id']: l for l in p['lessons']}
assert len(courses) == len(p['lessons'])
c = p['config']
for s in c['subjects']: Subject.model_validate(s)
for level in c['levels']: Level.model_validate(level)
placements = {}
for t in c['tracks']:
    ids = []
    for m in t['modules']:
        Module.model_validate(m)
        for cid in m['lessons']:
            assert cid in courses, cid
            assert t['id'] in courses[cid]['data']['tracks'], cid
            ids.append(cid)
            placements.setdefault(cid, set()).add(t['id'])
    assert len(ids) == len(set(ids)), t['id']
for cid, l in courses.items():
    d = l['data']
    CourseDraft.model_validate(d if cid in p['newIds'] else contract_fields(d))
    validate_classification(d, c['tracks'], c['subjects'], c['levels'])
    assert placements.get(cid) == set(d['tracks']), cid
    assert l['status'] == d['status']
    if 'explore' in d['tracks']: assert d['subject'] == 'islam' and d['level'] == 1
    if 'first-steps' in d['tracks']: assert d['level'] in (1, 2)
for old in b['lessons']:
    new = courses[old['id']]
    for field in set(old['data']) | set(new['data']):
        if field not in {'title', 'subject', 'level', 'tracks', 'status', 'coming_soon'}:
            assert old['data'].get(field) == new['data'].get(field), (old['id'], field)
    if old['status'] == 'draft': assert new['status'] == 'published' and new['data']['coming_soon'] is True
    if old['status'] == 'published': assert old['data'].get('coming_soon') == new['data'].get('coming_soon')
for t in c['tracks']:
    for m in t['modules']:
        if t['id'] == 'deepen':
            level = int(m['title']['en'].split(':')[0].split()[-1])
            assert all(courses[cid]['data']['level'] == level for cid in m['lessons']), m['id']
fs = next(t for t in c['tracks'] if t['id'] == 'first-steps')
prayer = next(m for m in fs['modules'] if m['id'] == 'build-my-daily-worship')['lessons']
assert prayer.index('fs-wudu-step-by-step') < prayer.index('fs-how-to-pray')
assert prayer.index('fs-before-prayer') < prayer.index('fs-how-to-pray')
assert prayer.index('fs-what-i-recite') < prayer.index('fs-how-to-pray')
print(f"OK: {len(courses)} courses, {len(p['newIds'])} additions; titles, contracts, memberships, difficulty, order and preserved content checked.")
