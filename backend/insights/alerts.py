"""
Spending Alerts Service.
Generates real-time notifications when budget thresholds are approached/exceeded.
"""

from datetime import date
from decimal import Decimal
from django.db.models import Sum
from finance.models import Transaction, Budget


def check_budget_alerts(user):
    """
    Check all current-month budgets and generate alerts at 80% and 100%.
    Returns list of alert dicts.
    """
    today = date.today()
    budgets = Budget.objects.filter(
        user=user, month=today.month, year=today.year,
    ).select_related('category')

    alerts = []
    for budget in budgets:
        spent = Transaction.objects.filter(
            user=user, type='expense',
            category=budget.category,
            date__month=today.month, date__year=today.year,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        pct = float(spent) / float(budget.amount) * 100 if budget.amount > 0 else 0
        remaining = float(budget.amount) - float(spent)

        if pct >= 100:
            alerts.append({
                'level': 'danger',
                'icon': '🚨',
                'title': f'{budget.category.name} Budget Exceeded!',
                'message': f'You\'ve spent ₹{float(spent):,.2f} of your '
                           f'₹{float(budget.amount):,.2f} {budget.category.name} budget. '
                           f'Over by ₹{abs(remaining):,.2f}.',
                'category': budget.category.name,
                'category_id': budget.category.id,
                'budget_amount': float(budget.amount),
                'spent': float(spent),
                'percentage': round(pct, 1),
                'remaining': round(remaining, 2),
            })
        elif pct >= 80:
            alerts.append({
                'level': 'warning',
                'icon': '⚠️',
                'title': f'{budget.category.name} Budget at {round(pct)}%',
                'message': f'You\'ve used {round(pct, 1)}% of your {budget.category.name} budget. '
                           f'Only ₹{remaining:,.2f} remaining.',
                'category': budget.category.name,
                'category_id': budget.category.id,
                'budget_amount': float(budget.amount),
                'spent': float(spent),
                'percentage': round(pct, 1),
                'remaining': round(remaining, 2),
            })

    # Sort: danger first, then warning
    alerts.sort(key=lambda x: 0 if x['level'] == 'danger' else 1)
    return alerts


def check_transaction_alert(user, transaction):
    """
    Check if a newly added transaction triggers a budget alert.
    Called after creating/updating a transaction.
    """
    if transaction.type != 'expense' or not transaction.category:
        return None

    today = date.today()
    budget = Budget.objects.filter(
        user=user,
        category=transaction.category,
        month=today.month,
        year=today.year,
    ).first()

    if not budget:
        return None

    spent = Transaction.objects.filter(
        user=user, type='expense',
        category=transaction.category,
        date__month=today.month, date__year=today.year,
    ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

    pct = float(spent) / float(budget.amount) * 100 if budget.amount > 0 else 0

    if pct >= 100:
        return {
            'level': 'danger',
            'title': f'{budget.category.name} budget exceeded!',
            'percentage': round(pct, 1),
        }
    elif pct >= 80:
        return {
            'level': 'warning',
            'title': f'{budget.category.name} budget at {round(pct)}%',
            'percentage': round(pct, 1),
        }

    return None
