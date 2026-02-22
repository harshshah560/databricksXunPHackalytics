import os
import unicodedata
from django.conf import settings


CATEGORY_KEYWORDS = {
    'Food Security': [
        'FOOD', 'NUTRITION', 'AGRICULTURE', 'LIVELIHOODS', 'LIVELIHOOD',
        'ALIMENTAIRE', 'ALIMENTARIA', 'SECURITE ALIMENTAIRE',
        'SEGURIDAD ALIMENTARIA',
    ],
    'Health': ['HEALTH', 'SANTE', 'SALUD'],
    'WASH': [
        'WASH', 'WATER', 'SANITATION', 'HYGIENE',
        'EAU', 'AGUA', 'ASSAINISSEMENT', 'EHA',
    ],
    'Shelter': [
        'SHELTER', 'ABRIS', 'ALOJAMIENTO', 'HOUSING',
        'NFI', 'NON-FOOD', 'CCCM', 'CAMP COORD',
    ],
    'Protection': [
        'PROTECTION', 'CHILD PROTECT', 'GBV', 'GENDER',
        'MINE ACTION', 'VBG',
    ],
    'Education': ['EDUCATION', 'EDUCACION'],
}

ISSUE_CATEGORIES = list(CATEGORY_KEYWORDS.keys())

COUNTRY_NAMES = {
    'AFG': 'Afghanistan', 'BFA': 'Burkina Faso', 'CAF': 'Central African Rep.',
    'COD': 'DR Congo', 'COL': 'Colombia', 'ETH': 'Ethiopia', 'HTI': 'Haiti',
    'IRQ': 'Iraq', 'LBN': 'Lebanon', 'MLI': 'Mali', 'MMR': 'Myanmar',
    'MOZ': 'Mozambique', 'NER': 'Niger', 'NGA': 'Nigeria', 'PSE': 'Palestine',
    'SDN': 'Sudan', 'SOM': 'Somalia', 'SSD': 'South Sudan', 'SYR': 'Syria',
    'TCD': 'Chad', 'UKR': 'Ukraine', 'VEN': 'Venezuela', 'YEM': 'Yemen',
    'CAR': 'Central African Rep.', 'DRC': 'DR Congo', 'JOR': 'Jordan', 'PAK': 'Pakistan',
}


def _normalize(text: str | None) -> str:
    if not text:
        return ''
    norm = unicodedata.normalize('NFKD', text)
    norm = ''.join([c for c in norm if not unicodedata.combining(c)])
    return norm.upper()


def categorize_cluster(cluster_name: str | None) -> str | None:
    upper = _normalize(cluster_name)
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(k in upper for k in keywords):
            return cat
    return None


def group_by(rows: list[dict], key: str) -> dict:
    grouped: dict = {}
    for row in rows:
        k = row.get(key)
        grouped.setdefault(k, []).append(row)
    return grouped


def build_countries(cbpf_rows: list[dict], cluster_rows: list[dict], affected_rows: list[dict], world_rows: list[dict]) -> list[dict]:
    cbpf_by_country = group_by(cbpf_rows, 'countrycode')

    world_by_country = {}
    for r in world_rows:
        world_by_country[r.get('countrycode')] = {
            'life_expectancy': float(r.get('life_expectancy') or 0),
            'infant_mortality': float(r.get('infant_mortality') or 0),
            'maternal_mortality_ratio': float(r.get('maternal_mortality_ratio') or 0),
            'physicians_per_thousand': float(r.get('physicians_per_thousand') or 0),
            'out_of_pocket_health_pct': float(r.get('out_of_pocket_health_pct') or 0),
            'birth_rate': float(r.get('birth_rate') or 0),
            'fertility_rate': float(r.get('fertility_rate') or 0),
            'gdp': float(r.get('gdp') or 0),
            'population': float(r.get('population') or 0),
            'urban_population': float(r.get('urban_population') or 0),
            'unemployment_rate': float(r.get('unemployment_rate') or 0),
            'latitude': float(r.get('latitude') or 0),
            'longitude': float(r.get('longitude') or 0),
            'vulnerability_score': float(r.get('vulnerability_score') or 0),
        }

    affected_by_country: dict = {}
    for r in affected_rows:
        yr = int(r.get('year') or 0)
        cc = r.get('countrycode')
        if not cc:
            continue
        if cc not in affected_by_country or yr > affected_by_country[cc].get('_year', 0):
            affected_by_country[cc] = {
                '_year': yr,
                'boys': float(r.get('boys_targeted') or 0),
                'girls': float(r.get('girls_targeted') or 0),
                'men': float(r.get('men_targeted') or 0),
                'women': float(r.get('women_targeted') or 0),
                'total': float(r.get('total_targeted') or 0),
            }

    cluster_agg: dict = {}
    cluster_history: dict = {}
    for r in cluster_rows:
        cat = categorize_cluster(r.get('cluster'))
        if not cat:
            continue
        cc = r.get('countrycode')
        if not cc:
            continue
        yr = int(r.get('year') or 0)
        req = float(r.get('requirements') or 0)
        fund = float(r.get('funding') or 0)
        key = f"{cc}|{yr}|{cat}"
        if key not in cluster_agg:
            cluster_agg[key] = {'cc': cc, 'yr': yr, 'cat': cat, 'req': 0, 'fund': 0}
        cluster_agg[key]['req'] += req
        cluster_agg[key]['fund'] += fund

        cluster_history.setdefault(cc, {}).setdefault(cat, {}).setdefault(yr, {'req': 0, 'fund': 0})
        cluster_history[cc][cat][yr]['req'] += req
        cluster_history[cc][cat][yr]['fund'] += fund

    breakdown_by_country: dict = {}
    preferred_years = [2025, 2024, 2026, 2023]
    all_ccs = set(cbpf_by_country.keys()) | set(world_by_country.keys())

    for cc in all_ccs:
        for yr in preferred_years:
            cats = {}
            for cat in ISSUE_CATEGORIES:
                agg = cluster_agg.get(f"{cc}|{yr}|{cat}")
                if agg and agg['req'] > 0:
                    cats[cat] = agg
            if cats:
                breakdown_by_country[cc] = cats
                break

    history_by_country: dict = {}
    for cc, cat_map in cluster_history.items():
        history_by_country[cc] = {}
        for cat, yr_map in cat_map.items():
            history_by_country[cc][cat] = [
                {'year': int(yr), 'req': vals['req'], 'fund': vals['fund']}
                for yr, vals in yr_map.items()
            ]
            history_by_country[cc][cat].sort(key=lambda x: x['year'])

    countries = []
    for cc in all_ccs:
        wi = world_by_country.get(cc, {})
        af = affected_by_country.get(cc, {'boys': 0, 'girls': 0, 'men': 0, 'women': 0, 'total': 0})
        bd_raw = breakdown_by_country.get(cc, {})
        cbpf_list = [
            {
                'year': int(r.get('year') or 0),
                'cbpf_funding': float(r.get('cbpf_funding') or 0),
                'cbpf_target': float(r.get('cbpf_target') or 0),
            }
            for r in cbpf_by_country.get(cc, [])
        ]
        cbpf_list.sort(key=lambda x: x['year'])

        cluster_breakdown = {}
        issue_pct_funded = {}
        for cat, v in bd_raw.items():
            pct = round((v['fund'] / v['req']) * 1000) / 10 if v['req'] > 0 else 0
            cluster_breakdown[cat] = {'req': v['req'], 'fund': v['fund'], 'pct': pct}
            issue_pct_funded[cat] = pct

        pop = wi.get('population', 0) or 0
        pop_impact_pct = round((af.get('total', 0) / pop) * 1000) / 10 if pop > 0 else 0

        countries.append({
            'code': cc,
            'name': COUNTRY_NAMES.get(cc, cc),
            'lat': wi.get('latitude', 0) or 0,
            'lng': wi.get('longitude', 0) or 0,
            'cbpf_timeline': cbpf_list,
            'cluster_breakdown': cluster_breakdown,
            'cluster_history': history_by_country.get(cc, {}),
            'issue_pct_funded': issue_pct_funded,
            'affected': {
                'boys': af.get('boys', 0),
                'girls': af.get('girls', 0),
                'men': af.get('men', 0),
                'women': af.get('women', 0),
                'total': af.get('total', 0),
            },
            'world': wi,
            'pop_impact_pct': pop_impact_pct,
        })

    countries = [c for c in countries if c.get('lat') or c.get('lng')]
    return countries


def compute_cluster_funding(rows: list[dict]) -> list[dict]:
    if not rows:
        return []
    latest_year = max(int(r.get('year') or 0) for r in rows)
    filtered = [r for r in rows if int(r.get('year') or 0) == latest_year]
    out = []
    for r in filtered:
        required = float(r.get('required') or 0)
        funded = float(r.get('funded') or 0)
        pct = round((funded / required) * 100) if required > 0 else 0
        out.append({
            'cluster': r.get('cluster'),
            'required': required,
            'funded': funded,
            'percentFunded': pct,
        })
    return out


def compute_funding_trends(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        required = float(r.get('required') or 0)
        funded = float(r.get('funded') or 0)
        gap = required - funded
        pct = round((funded / required) * 100) if required > 0 else 0
        out.append({
            'year': int(r.get('year') or 0),
            'required': required,
            'funded': funded,
            'gap': gap,
            'percentFunded': pct,
        })
    out.sort(key=lambda x: x['year'])
    return out


def compute_cbpf_summary(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        hrp_required = float(r.get('hrp_required') or r.get('hrp_requirements') or 0)
        hrp_funding = float(r.get('hrp_funding') or 0)
        cbpf_funding = float(r.get('cbpf_funding') or 0)
        pct = round((cbpf_funding / hrp_funding) * 1000) / 10 if hrp_funding > 0 else 0
        country_code = r.get('countrycode') or r.get('country')
        out.append({
            'country': COUNTRY_NAMES.get(country_code, country_code),
            'cbpfFunding': cbpf_funding,
            'hrpFunding': hrp_funding,
            'hrpRequired': hrp_required,
            'cbpfPercent': pct,
        })
    return out
