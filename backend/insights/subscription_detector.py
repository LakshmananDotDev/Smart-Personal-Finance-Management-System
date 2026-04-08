"""
Subscription Detector.
Identifies recurring transactions based on amount patterns and frequency.
"""

from datetime import date, timedelta
from decimal import Decimal
from collections import defaultdict
from django.db.models import Count, Q
from finance.models import Transaction, Subscription


def detect_subscriptions(user):
    """
    Analyze user's transactions to find recurring payments.
    Looks for same-amount transactions appearing monthly.
    Returns list of detected subscription candidates.
    """
    # Look at last 6 months of expenses
    six_months_ago = date.today() - timedelta(days=180)
    expenses = Transaction.objects.filter(
        user=user,
        type='expense',
        date__gte=six_months_ago,
    ).order_by('amount', 'date')

    # Group by amount (with small tolerance for rounding)
    amount_groups = defaultdict(list)
    for tx in expenses:
        # Round to nearest integer for grouping
        key = round(float(tx.amount))
        amount_groups[key].append(tx)

    detected = []
    existing_subs = set(
        Subscription.objects.filter(user=user)
        .values_list('name', 'amount')
    )

    for amount_key, txs in amount_groups.items():
        if len(txs) < 2:
            continue

        # Check if transactions appear roughly monthly
        dates = sorted([tx.date for tx in txs])
        intervals = []
        for i in range(1, len(dates)):
            delta = (dates[i] - dates[i - 1]).days
            intervals.append(delta)

        if not intervals:
            continue

        avg_interval = sum(intervals) / len(intervals)

        # Monthly: 25-35 days, Weekly: 5-9 days, Yearly: 340-400 days
        frequency = None
        if 25 <= avg_interval <= 35:
            frequency = 'monthly'
        elif 5 <= avg_interval <= 9:
            frequency = 'weekly'
        elif 340 <= avg_interval <= 400:
            frequency = 'yearly'

        if not frequency:
            continue

        # Use the most common notes/merchant as the name
        names = [tx.merchant or tx.notes or tx.category.name if tx.category else 'Unknown'
                 for tx in txs]
        name_counts = defaultdict(int)
        for n in names:
            if n:
                name_counts[n.strip()] += 1

        name = max(name_counts, key=name_counts.get) if name_counts else f'Recurring ₹{amount_key}'
        amount = txs[-1].amount  # Use most recent amount
        category = txs[-1].category

        # Skip if already tracked
        if (name, amount) in existing_subs:
            continue

        # Estimate next date
        last_date = dates[-1]
        if frequency == 'monthly':
            next_date = last_date + timedelta(days=30)
        elif frequency == 'weekly':
            next_date = last_date + timedelta(days=7)
        else:
            next_date = last_date + timedelta(days=365)

        detected.append({
            'name': name[:200],
            'amount': float(amount),
            'frequency': frequency,
            'category_id': category.id if category else None,
            'category_name': category.name if category else None,
            'occurrences': len(txs),
            'avg_interval_days': round(avg_interval),
            'last_date': last_date.isoformat(),
            'next_date': next_date.isoformat(),
            'confidence': min(0.5 + len(txs) * 0.1, 0.95),
        })

    # Sort by confidence descending
    detected.sort(key=lambda x: x['confidence'], reverse=True)
    return detected


def confirm_subscription(user, data):
    """Create a Subscription record from detected or manually entered data."""
    sub = Subscription.objects.create(
        user=user,
        name=data['name'],
        amount=data['amount'],
        category_id=data.get('category_id'),
        frequency=data.get('frequency', 'monthly'),
        is_active=True,
        detected_auto=data.get('detected_auto', False),
        next_date=data.get('next_date'),
    )
    return sub


def get_subscription_summary(user):
    """Calculate total monthly subscription cost."""
    subs = Subscription.objects.filter(user=user, is_active=True)

    total_monthly = Decimal('0')
    for sub in subs:
        if sub.frequency == 'weekly':
            total_monthly += sub.amount * 4
        elif sub.frequency == 'monthly':
            total_monthly += sub.amount
        elif sub.frequency == 'yearly':
            total_monthly += sub.amount / 12

    return {
        'subscriptions': list(subs.values(
            'id', 'name', 'amount', 'frequency', 'is_active',
            'category__name', 'next_date', 'detected_auto',
        )),
        'count': subs.count(),
        'total_monthly': round(float(total_monthly), 2),
        'total_yearly': round(float(total_monthly * 12), 2),
    }
