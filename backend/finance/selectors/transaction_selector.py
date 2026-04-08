from django.db.models import Q, Sum, Count, Max

from finance.models import Transaction


def _safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def build_transaction_queryset(user, params):
    qs = Transaction.objects.filter(user=user).select_related('category', 'account')

    tx_type = params.get('type')
    category = params.get('category')
    date_from = params.get('date_from')
    date_to = params.get('date_to')
    month = _safe_int(params.get('month'))
    year = _safe_int(params.get('year'))
    search = params.get('search')

    if tx_type:
        qs = qs.filter(type=tx_type)
    if category:
        qs = qs.filter(category_id=category)
    if date_from:
        qs = qs.filter(date__gte=date_from)
    if date_to:
        qs = qs.filter(date__lte=date_to)
    if year:
        qs = qs.filter(date__year=year)
    if month and year:
        qs = qs.filter(date__month=month)
    if search:
        qs = qs.filter(
            Q(notes__icontains=search)
            | Q(category__name__icontains=search)
            | Q(merchant__icontains=search)
            | Q(location_name__icontains=search)
        )

    return qs.order_by('-date', '-created_at', '-id')


def build_spending_hotspots(qs):
    return (
        qs.filter(type='expense', latitude__isnull=False, longitude__isnull=False)
        .values('location_name', 'latitude', 'longitude')
        .annotate(total_spent=Sum('amount'), transaction_count=Count('id'), last_spent=Max('date'))
        .order_by('-total_spent')[:200]
    )
