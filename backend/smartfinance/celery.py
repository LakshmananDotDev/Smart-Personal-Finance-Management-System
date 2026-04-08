import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartfinance.settings')

app = Celery('smartfinance')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
