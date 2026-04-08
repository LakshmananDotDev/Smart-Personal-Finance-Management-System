from django.urls import path
from tax import views

urlpatterns = [
    path('summary/', views.tax_summary, name='tax-summary'),
    path('regime-comparison/', views.regime_comparison, name='tax-regime-comparison'),
    path('estimator/', views.tax_estimator, name='tax-estimator'),
    path('suggestions/', views.tax_suggestions, name='tax-suggestions'),
]
