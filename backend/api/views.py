import os
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.conf import settings
from .databricks import execute_sql, qualify_table, DatabricksError
from .transforms import (
    build_countries,
    compute_cluster_funding,
    compute_funding_trends,
    compute_cbpf_summary,
)


def _error(message: str, status: int = 502) -> JsonResponse:
    return JsonResponse({'error': message}, status=status)


@require_GET
def healthz(request):
    return JsonResponse({'status': 'ok'})


@require_GET
def countries(request):
    try:
        cbpf_table = os.getenv('TABLE_CBPFVSHRP', 'cbpfvshrp')
        fts_cluster_table = os.getenv('TABLE_FTS_CLUSTER', 'fts_cluster')
        affected_table = os.getenv('TABLE_AFFECTED', 'affected_persons_clean')
        world_table = os.getenv('TABLE_WORLD', 'world_indicators')

        cbpf_rows = execute_sql(
            f"SELECT countrycode, year, cbpf_funding, cbpf_target, hrp_funding, hrp_requirements "
            f"FROM {qualify_table(cbpf_table)} ORDER BY countrycode, year"
        )
        cluster_rows = execute_sql(
            f"SELECT countrycode, CAST(year AS INT) AS year, cluster, "
            f"CAST(requirements AS DOUBLE) AS requirements, CAST(funding AS DOUBLE) AS funding "
            f"FROM {qualify_table(fts_cluster_table)} ORDER BY countrycode, year"
        )
        affected_rows = execute_sql(
            f"SELECT CAST(year AS INT) AS year, countrycode, "
            f"CAST(boys_targeted AS DOUBLE) AS boys_targeted, "
            f"CAST(girls_targeted AS DOUBLE) AS girls_targeted, "
            f"CAST(men_targeted AS DOUBLE) AS men_targeted, "
            f"CAST(women_targeted AS DOUBLE) AS women_targeted, "
            f"CAST(total_targeted AS DOUBLE) AS total_targeted "
            f"FROM {qualify_table(affected_table)} ORDER BY countrycode, year DESC"
        )
        world_rows = execute_sql(
            f"SELECT countrycode, life_expectancy, infant_mortality, maternal_mortality_ratio, "
            f"physicians_per_thousand, out_of_pocket_health_pct, birth_rate, fertility_rate, "
            f"gdp, population, urban_population, unemployment_rate, latitude, longitude, vulnerability_score "
            f"FROM {qualify_table(world_table)}"
        )

        payload = build_countries(cbpf_rows, cluster_rows, affected_rows, world_rows)
        return JsonResponse(payload, safe=False)
    except DatabricksError as exc:
        return _error(str(exc))


@require_GET
def cluster_funding(request):
    try:
        sql_override = os.getenv('DATABRICKS_CLUSTER_FUNDING_SQL', '')
        table = os.getenv('TABLE_FTS_CLUSTER', 'fts_cluster')
        sql = sql_override or (
            f"SELECT CAST(year AS INT) AS year, cluster, "
            f"SUM(CAST(requirements AS DOUBLE)) AS required, "
            f"SUM(CAST(funding AS DOUBLE)) AS funded "
            f"FROM {qualify_table(table)} GROUP BY CAST(year AS INT), cluster"
        )
        rows = execute_sql(sql)
        payload = compute_cluster_funding(rows)
        return JsonResponse(payload, safe=False)
    except DatabricksError as exc:
        return _error(str(exc))


@require_GET
def top_donors(request):
    sql_override = os.getenv('DATABRICKS_TOP_DONORS_SQL', '')
    table = os.getenv('TABLE_TOP_DONORS', '')
    if not sql_override and not table:
        return JsonResponse([], safe=False)
    try:
        sql = sql_override or (
            f"SELECT donor, SUM(amount) AS amount FROM {qualify_table(table)} GROUP BY donor ORDER BY amount DESC LIMIT 10"
        )
        rows = execute_sql(sql)
        payload = [
            {
                'donor': r.get('donor'),
                'amount': float(r.get('amount') or 0),
            }
            for r in rows
        ]
        return JsonResponse(payload, safe=False)
    except DatabricksError as exc:
        return _error(str(exc))


@require_GET
def funding_trends(request):
    try:
        sql_override = os.getenv('DATABRICKS_TRENDS_SQL', '')
        table = os.getenv('TABLE_TRENDS', 'fts_cluster')
        sql = sql_override or (
            f"SELECT CAST(year AS INT) AS year, "
            f"SUM(CAST(requirements AS DOUBLE)) AS required, "
            f"SUM(CAST(funding AS DOUBLE)) AS funded "
            f"FROM {qualify_table(table)} GROUP BY CAST(year AS INT) ORDER BY year"
        )
        rows = execute_sql(sql)
        payload = compute_funding_trends(rows)
        return JsonResponse(payload, safe=False)
    except DatabricksError as exc:
        return _error(str(exc))


@require_GET
def cbpf_data(request):
    try:
        sql_override = os.getenv('DATABRICKS_CBPF_SQL', '')
        table = os.getenv('TABLE_CBPF_SUMMARY', 'cbpfvshrp')
        sql = sql_override or (
            f"SELECT countrycode, cbpf_funding, hrp_funding, hrp_requirements "
            f"FROM {qualify_table(table)} WHERE hrp_requirements > 0 ORDER BY cbpf_funding DESC LIMIT 12"
        )
        rows = execute_sql(sql)
        payload = compute_cbpf_summary(rows)
        return JsonResponse(payload, safe=False)
    except DatabricksError as exc:
        return _error(str(exc))


@require_GET
def data_sources(request):
    sources = [
        {
            'id': 'affected_persons_clean',
            'name': 'Affected Persons (Clean)',
            'filename': 'affected_persons_clean',
            'rows': 0,
            'description': 'Targeted populations by age and gender.',
            'fields': ['countrycode', 'year', 'boys_targeted', 'girls_targeted', 'men_targeted', 'women_targeted', 'total_targeted'],
        },
        {
            'id': 'cbpfvshrp',
            'name': 'CBPF vs HRP',
            'filename': 'cbpfvshrp',
            'rows': 0,
            'description': 'CBPF allocations compared against HRP funding and requirements.',
            'fields': ['countrycode', 'year', 'cbpf_funding', 'cbpf_target'],
        },
        {
            'id': 'fts_cluster',
            'name': 'FTS Funding by Cluster',
            'filename': 'fts_cluster',
            'rows': 0,
            'description': 'Cluster level funding by country and year.',
            'fields': ['countrycode', 'year', 'cluster', 'requirements', 'funding'],
        },
        {
            'id': 'humanitarian_response_plans',
            'name': 'Humanitarian Response Plans',
            'filename': 'humanitarian_response_plans',
            'rows': 0,
            'description': 'Response plans and requirements.',
            'fields': ['plan', 'year', 'requirements'],
        },
        {
            'id': 'projects_clean',
            'name': 'Projects (Clean)',
            'filename': 'projects_clean',
            'rows': 0,
            'description': 'Project level allocations and partners.',
            'fields': ['project_code', 'partner', 'allocation', 'targeted_people'],
        },
        {
            'id': 'sectors_overview_clean',
            'name': 'Sectors Overview (Clean)',
            'filename': 'sectors_overview_clean',
            'rows': 0,
            'description': 'Sector overview funding metrics.',
            'fields': ['year', 'sector', 'requirements', 'funding'],
        },
        {
            'id': 'world_indicators',
            'name': 'World Indicators',
            'filename': 'world_indicators',
            'rows': 0,
            'description': 'Country level indicators and coordinates.',
            'fields': ['countrycode', 'population', 'latitude', 'longitude'],
        },
    ]
    return JsonResponse(sources, safe=False)
