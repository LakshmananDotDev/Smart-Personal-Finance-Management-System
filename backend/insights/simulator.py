"""
What-If Financial Simulator.
Projects financial outcomes based on hypothetical spending changes.
"""

from datetime import date, timedelta
from decimal import Decimal
from django.db.models import Sum
from finance.models import Transaction, Category


class WhatIfSimulator:
    def __init__(self, user):
        self.user = user
        self.today = date.today()

    def get_baseline(self):
        """Return current monthly averages by category for slider setup."""
        three_months_ago = self.today - timedelta(days=90)

        categories = (
            Transaction.objects.filter(
                user=self.user, type='expense', date__gte=three_months_ago,
            )
            .values('category__id', 'category__name', 'category__icon', 'category__color')
            .annotate(total=Sum('amount'))
            .order_by('-total')
        )

        avg_income = Transaction.objects.filter(
            user=self.user, type='income', date__gte=three_months_ago,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        avg_income = float(avg_income) / 3

        result = []
        total_expenses = 0
        for cat in categories:
            monthly = float(cat['total']) / 3
            total_expenses += monthly
            result.append({
                'category_id': cat['category__id'],
                'category_name': cat['category__name'],
                'icon': cat['category__icon'] or '📊',
                'color': cat['category__color'] or '#6366f1',
                'monthly_average': round(monthly, 2),
            })

        return {
            'categories': result,
            'monthly_income': round(avg_income, 2),
            'monthly_expenses': round(total_expenses, 2),
            'monthly_savings': round(avg_income - total_expenses, 2),
        }

    def simulate(self, adjustments, months=12):
        """
        Simulate financial outcomes based on category spending adjustments.

        adjustments: list of {category_id, change_percent}
            e.g., [{"category_id": 1, "change_percent": -20}]
        months: number of months to project (default 12)
        """
        baseline = self.get_baseline()
        monthly_income = baseline['monthly_income']

        # Apply adjustments
        new_monthly_expenses = 0
        category_changes = []

        adjustment_map = {a['category_id']: a['change_percent'] for a in adjustments}

        for cat in baseline['categories']:
            cat_id = cat['category_id']
            original = cat['monthly_average']
            change_pct = adjustment_map.get(cat_id, 0)

            new_amount = original * (1 + change_pct / 100)
            new_amount = max(new_amount, 0)  # Can't go negative
            new_monthly_expenses += new_amount

            category_changes.append({
                'category_id': cat_id,
                'category_name': cat['category_name'],
                'icon': cat['icon'],
                'original': round(original, 2),
                'adjusted': round(new_amount, 2),
                'change_percent': change_pct,
                'monthly_savings': round(original - new_amount, 2),
            })

        original_savings = baseline['monthly_savings']
        new_savings = monthly_income - new_monthly_expenses
        extra_savings = new_savings - original_savings

        # Project over time
        projections = []
        cumulative_original = 0
        cumulative_new = 0
        for m in range(1, months + 1):
            cumulative_original += original_savings
            cumulative_new += new_savings
            projections.append({
                'month': m,
                'original_cumulative': round(cumulative_original, 2),
                'adjusted_cumulative': round(cumulative_new, 2),
                'difference': round(cumulative_new - cumulative_original, 2),
            })

        return {
            'monthly_income': round(monthly_income, 2),
            'original_expenses': round(baseline['monthly_expenses'], 2),
            'adjusted_expenses': round(new_monthly_expenses, 2),
            'original_savings': round(original_savings, 2),
            'adjusted_savings': round(new_savings, 2),
            'extra_monthly_savings': round(extra_savings, 2),
            'total_extra_savings': round(extra_savings * months, 2),
            'category_changes': category_changes,
            'projections': projections,
            'months': months,
        }
