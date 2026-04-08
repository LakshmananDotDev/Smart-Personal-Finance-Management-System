from celery import shared_task

from finance.models import Transaction
from finance.utils.location import geocode_location_name


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True, max_retries=3)
def geocode_transaction_if_needed(self, transaction_id):
    tx = Transaction.objects.filter(id=transaction_id).first()
    if not tx:
        return

    location = (tx.location_name or '').strip()
    if not location:
        return

    if tx.latitude is not None and tx.longitude is not None:
        return

    lat, lng = geocode_location_name(location)
    if lat is None or lng is None:
        return

    tx.latitude = lat
    tx.longitude = lng
    tx.save(update_fields=['latitude', 'longitude', 'updated_at'])
