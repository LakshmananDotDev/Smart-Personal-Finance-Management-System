from django.urls import path, include
from rest_framework.routers import DefaultRouter
from finance import views

router = DefaultRouter()
router.register(r'categories', views.CategoryViewSet, basename='category')
router.register(r'transactions', views.TransactionViewSet, basename='transaction')
router.register(r'budgets', views.BudgetViewSet, basename='budget')
router.register(r'savings-goals', views.SavingsGoalViewSet, basename='savings-goal')
router.register(r'accounts', views.AccountViewSet, basename='account')
router.register(r'subscriptions', views.SubscriptionViewSet, basename='subscription')

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/', views.dashboard_summary, name='dashboard'),
    path('reports/', views.reports, name='reports'),
]
