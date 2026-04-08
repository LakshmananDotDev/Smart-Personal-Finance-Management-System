from django.urls import path
from insights import views

urlpatterns = [
    path('', views.get_insights, name='insights'),
    path('chatbot/', views.chatbot_reply, name='chatbot-reply'),
    path('auto-categorize/', views.auto_categorize_view, name='auto-categorize'),
    path('scan-receipt/', views.scan_receipt, name='scan-receipt'),
    path('health-score/', views.health_score, name='health-score'),
    path('subscriptions/detect/', views.subscription_detect, name='subscription-detect'),
    path('goal-plan/', views.goal_plan, name='goal-plan'),
    path('simulator/baseline/', views.simulator_baseline, name='simulator-baseline'),
    path('simulator/simulate/', views.simulate, name='simulate'),
    path('behavioral/', views.behavioral_insights, name='behavioral'),
    path('alerts/', views.budget_alerts, name='budget-alerts'),
    path('csv/preview/', views.csv_preview, name='csv-preview'),
    path('csv/import/', views.csv_import, name='csv-import'),
]
