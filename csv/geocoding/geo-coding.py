import pandas as pd
import requests
from concurrent.futures import ThreadPoolExecutor
import pycountry

df = pd.read_csv('epidemic_cities.csv', encoding='latin-1')

GEONAMES_USER = "hsrah_hahs"

def get_country_code(country_name):
    try:
        match = pycountry.countries.search_fuzzy(country_name)
        return match[0].alpha_2
    except:
        return None

def get_population(country, city):
    if pd.isna(city) or str(city).strip() == '':
        return None
    
    country_code = get_country_code(country)
    
    try:
        url = "http://api.geonames.org/searchJSON"
        params = {
            "q": city.strip(),
            "maxRows": 1,
            "featureClass": "P",
            "username": GEONAMES_USER
        }
        if country_code:
            params["country"] = country_code
            
        r = requests.get(url, params=params, timeout=5)
        data = r.json()
        
        if data.get('geonames'):
            pop = data['geonames'][0].get('population', None)
            print(f"✓ {city}, {country} → {pop}")
            return pop
        
        print(f"✗ {city}, {country} → not found")
        return None
    except Exception as e:
        print(f"✗ {city}, {country} → error: {e}")
        return None

city_cols = ['City 1', 'City 2', 'City 3', 'City 4']

for col in city_cols:
    if col in df.columns:
        df[f'{col}_population'] = df.apply(
            lambda row: get_population(row['Country'], row[col]), axis=1
        )

df.to_csv('epidemic_pop.csv', index=False)
print("\nSaved to epidemic_pop.csv")