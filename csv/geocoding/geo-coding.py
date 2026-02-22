import pandas as pd
import requests
from concurrent.futures import ThreadPoolExecutor
from requests.utils import quote

df = pd.read_csv('geocoded_output.csv')

print(f"Rows before: {len(df)}")

df = df[df['total_affected'] != 0]
df = df[df['total_affected'].notna()]

print(f"Rows after: {len(df)}")

df.to_csv('cleaned_output.csv', index=False)
print("Saved to cleaned_output.csv")