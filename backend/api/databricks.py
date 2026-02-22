import os
import time
import requests
from django.conf import settings


class DatabricksError(RuntimeError):
    pass


def _base_url() -> str:
    host = settings.DATABRICKS_HOST or os.getenv('DATABRICKS_HOST', '')
    if not host:
        raise DatabricksError('Missing DATABRICKS_HOST')
    return host.rstrip('/')


def _auth_headers() -> dict:
    token = settings.DATABRICKS_TOKEN or os.getenv('DATABRICKS_TOKEN', '')
    if not token:
        raise DatabricksError('Missing DATABRICKS_TOKEN')
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }


def qualify_table(name: str, schema: str | None = None) -> str:
    if name.startswith('delta.`'):
        return name
    if name.startswith('/Volumes/'):
        return f"delta.`{name}`"
    if '.' in name:
        return name
    catalog = settings.DATABRICKS_CATALOG
    schema = schema or settings.DATABRICKS_SCHEMA
    return f'{catalog}.{schema}.{name}'


def execute_sql(statement: str) -> list[dict]:
    warehouse_id = settings.DATABRICKS_WAREHOUSE_ID or os.getenv('DATABRICKS_WAREHOUSE_ID', '')
    if not warehouse_id:
        raise DatabricksError('Missing DATABRICKS_WAREHOUSE_ID')

    url = f"{_base_url()}/api/2.0/sql/statements/"
    res = requests.post(
        url,
        headers=_auth_headers(),
        json={
            'warehouse_id': warehouse_id,
            'statement': statement,
            'wait_timeout': '30s',
            'disposition': 'INLINE',
            'format': 'JSON_ARRAY',
        },
        timeout=60,
    )
    if res.status_code >= 400:
        raise DatabricksError(f'Databricks HTTP {res.status_code}: {res.text[:200]}')

    data = res.json()
    status = data.get('status', {}).get('state')
    if status in ('PENDING', 'RUNNING'):
        return _poll_statement(data.get('statement_id'))
    if status == 'FAILED':
        raise DatabricksError(data.get('status', {}).get('error', {}).get('message', 'Query failed'))
    return _parse_statement(data)


def _poll_statement(statement_id: str | None, retries: int = 25, delay_s: float = 1.5) -> list[dict]:
    if not statement_id:
        raise DatabricksError('Missing statement_id for polling')
    url = f"{_base_url()}/api/2.0/sql/statements/{statement_id}"
    headers = _auth_headers()
    for _ in range(retries):
        time.sleep(delay_s)
        res = requests.get(url, headers=headers, timeout=60)
        if res.status_code >= 400:
            raise DatabricksError(f'Databricks HTTP {res.status_code}: {res.text[:200]}')
        data = res.json()
        status = data.get('status', {}).get('state')
        if status == 'SUCCEEDED':
            return _parse_statement(data)
        if status == 'FAILED':
            raise DatabricksError(data.get('status', {}).get('error', {}).get('message', 'Query failed'))
    raise DatabricksError('Query timed out after 37.5s')


def _parse_statement(data: dict) -> list[dict]:
    cols = [c.get('name') for c in data.get('manifest', {}).get('schema', {}).get('columns', [])]
    rows = []
    for row in data.get('result', {}).get('data_array', []) or []:
        obj = {}
        for i, col in enumerate(cols):
            obj[col] = row[i] if i < len(row) else None
        rows.append(obj)
    return rows
