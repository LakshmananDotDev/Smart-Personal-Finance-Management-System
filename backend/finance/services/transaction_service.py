from django.db.models import Q

from finance.models import Category, Transaction
from insights.categorizer import auto_categorize, infer_tax_section


def _sync_tax_section(tx):
    if tx.type != 'expense':
        if tx.tax_section:
            tx.tax_section = ''
            tx.save(update_fields=['tax_section', 'updated_at'])
        return

    text_parts = [
        tx.notes or '',
        tx.merchant or '',
        tx.location_name or '',
        (tx.category.name if tx.category else ''),
    ]
    inferred_section = infer_tax_section(' '.join(text_parts))

    if (tx.tax_section or '') != inferred_section:
        tx.tax_section = inferred_section
        tx.save(update_fields=['tax_section', 'updated_at'])


def _auto_assign_category(tx, user):
    if tx.category or not tx.notes:
        return

    result = auto_categorize(tx.notes, user)
    if not result:
        return

    try:
        tx.category = Category.objects.get(Q(user=user) | Q(is_default=True), id=result['category_id'])
        tx.auto_categorized = True
        tx.save(update_fields=['category', 'auto_categorized', 'updated_at'])
    except Category.DoesNotExist:
        return


def _schedule_geocode(tx):
    if not tx.location_name:
        if tx.latitude is not None or tx.longitude is not None:
            tx.latitude = None
            tx.longitude = None
            tx.save(update_fields=['latitude', 'longitude', 'updated_at'])
        return

    if tx.latitude is not None and tx.longitude is not None:
        return

    # Local import prevents circular imports during app initialization.
    from finance.tasks import geocode_transaction_if_needed

    geocode_transaction_if_needed.delay(tx.id)


def create_transaction(user, validated_data):
    tx = Transaction.objects.create(user=user, **validated_data)
    _auto_assign_category(tx, user)
    _sync_tax_section(tx)
    _schedule_geocode(tx)
    return tx


def update_transaction(tx, validated_data, user):
    for key, value in validated_data.items():
        setattr(tx, key, value)
    tx.save()

    _auto_assign_category(tx, user)
    _sync_tax_section(tx)
    _schedule_geocode(tx)
    return tx
