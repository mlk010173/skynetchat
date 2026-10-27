#!/usr/bin/env python3
"""Validate the packaged catalog metadata; does not connect to any provider."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
a = json.loads((root / 'integrations/registry.json').read_text(encoding='utf-8'))
b = json.loads((root / 'frontend/src/data/connectors.json').read_text(encoding='utf-8'))
assert a == b, 'Registry and frontend JSON must remain identical'
connectors = a['connectors']
assert a['total'] == len(connectors), 'total field does not match connector count'
ids = [c['id'] for c in connectors]
assert len(ids) == len(set(ids)), 'Duplicate connector IDs'
assert all(c['status'] == 'catalog_only' for c in connectors), 'An entry was marked active without adapter review'
assert all(c['requiresSetup'] for c in connectors), 'Every catalog item should disclose setup requirement'
assert all(isinstance(c['credentialsExpected'], bool) for c in connectors), 'credentialsExpected must be a boolean'
assert all(not c['officialDocsUrl'] or c['officialDocsUrl'].startswith('https://') for c in connectors), 'Non-HTTPS docs URL'
print(f'OK: {len(connectors)} catalog items; unique IDs; JSON mirrors match; all statuses are catalog_only.')
