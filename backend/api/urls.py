from django.urls import path
from . import views

urlpatterns = [
    path('healthz/', views.healthz, name='healthz'),
    path('countries/', views.countries, name='countries'),
    path('visualizations/cluster-funding/', views.cluster_funding, name='cluster_funding'),
    path('visualizations/top-donors/', views.top_donors, name='top_donors'),
    path('visualizations/funding-trends/', views.funding_trends, name='funding_trends'),
    path('visualizations/cbpf/', views.cbpf_data, name='cbpf_data'),
    path('sources/', views.data_sources, name='data_sources'),
]
