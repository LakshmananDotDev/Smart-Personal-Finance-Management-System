"""
AI Insights Engine for Smart Finance Manager.

Analyzes user spending patterns and generates actionable insights.
Designed to be modular — can be extended with ML models in the future.
"""

from datetime import date, timedelta
from decimal import Decimal
from django.db.models import Sum, Avg, Count, Q
from finance.models import Transaction, Budget, Category
from tax.services import TaxOptimizerService


class InsightsEngine:
    def __init__(self, user):
        self.user = user
        self.today = date.today()
        self.current_month = self.today.month
        self.current_year = self.today.year

    def generate_all_insights(self):
        insights = []
        insights.extend(self._spending_trends())
        insights.extend(self._budget_warnings())
        insights.extend(self._category_comparison())
        insights.extend(self._savings_analysis())
        insights.extend(self._spending_velocity())
        insights.extend(self._top_spending_categories())
        insights.extend(self._income_analysis())
        insights.extend(self._tax_optimization())
        return insights

    def _get_month_transactions(self, month=None, year=None):
        m = month or self.current_month
        y = year or self.current_year
        return Transaction.objects.filter(
            user=self.user, date__month=m, date__year=y
        )

    def _spending_trends(self):
        insights = []
        current = self._get_month_transactions()
        current_expense = current.filter(type='expense').aggregate(
            t=Sum('amount')
        )['t'] or Decimal('0')

        prev_month = self.current_month - 1 if self.current_month > 1 else 12
        prev_year = self.current_year if self.current_month > 1 else self.current_year - 1
        previous = self._get_month_transactions(prev_month, prev_year)
        prev_expense = previous.filter(type='expense').aggregate(
            t=Sum('amount')
        )['t'] or Decimal('0')

        if prev_expense > 0:
            change = ((current_expense - prev_expense) / prev_expense) * 100
            change_val = round(float(change), 1)

            if change_val > 15:
                insights.append({
                    'type': 'warning',
                    'icon': 'trending-up',
                    'title': 'Spending Increase Alert',
                    'message': f'Your spending is up {change_val}% compared to last month. '
                               f'Consider reviewing your expenses to stay on track.',
                    'priority': 'high',
                })
            elif change_val < -10:
                insights.append({
                    'type': 'success',
                    'icon': 'trending-down',
                    'title': 'Great Savings Progress!',
                    'message': f'You\'ve reduced spending by {abs(change_val)}% compared to last month. '
                               f'Keep up the good work!',
                    'priority': 'medium',
                })

        return insights

    def _budget_warnings(self):
        insights = []
        budgets = Budget.objects.filter(
            user=self.user, month=self.current_month, year=self.current_year
        ).select_related('category')

        for budget in budgets:
            spent = Transaction.objects.filter(
                user=self.user, type='expense',
                category=budget.category,
                date__month=self.current_month,
                date__year=self.current_year,
            ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

            pct = float(spent) / float(budget.amount) * 100 if budget.amount > 0 else 0

            if pct >= 100:
                insights.append({
                    'type': 'danger',
                    'icon': 'alert-circle',
                    'title': f'{budget.category.name} Budget Exceeded',
                    'message': f'You\'ve spent ₹{float(spent):,.2f} on {budget.category.name}, '
                               f'exceeding your ₹{float(budget.amount):,.2f} budget by '
                               f'₹{float(spent - budget.amount):,.2f}.',
                    'priority': 'high',
                })
            elif pct >= 80:
                remaining = float(budget.amount) - float(spent)
                insights.append({
                    'type': 'warning',
                    'icon': 'alert-triangle',
                    'title': f'{budget.category.name} Budget Nearly Reached',
                    'message': f'You\'ve used {round(pct, 1)}% of your {budget.category.name} budget. '
                               f'Only ₹{remaining:,.2f} remaining.',
                    'priority': 'high',
                })

        return insights

    def _category_comparison(self):
        insights = []
        categories = Category.objects.filter(
            Q(user=self.user) | Q(is_default=True)
        )

        for cat in categories:
            current_spent = Transaction.objects.filter(
                user=self.user, type='expense', category=cat,
                date__month=self.current_month, date__year=self.current_year,
            ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

            three_month_avg = Decimal('0')
            count = 0
            for i in range(1, 4):
                m = self.current_month - i
                y = self.current_year
                if m <= 0:
                    m += 12
                    y -= 1
                spent = Transaction.objects.filter(
                    user=self.user, type='expense', category=cat,
                    date__month=m, date__year=y,
                ).aggregate(t=Sum('amount'))['t']
                if spent:
                    three_month_avg += spent
                    count += 1

            if count > 0:
                avg = three_month_avg / count
                if avg > 0 and current_spent > avg * Decimal('1.3'):
                    pct = round(float((current_spent - avg) / avg * 100), 1)
                    insights.append({
                        'type': 'info',
                        'icon': 'bar-chart',
                        'title': f'Higher {cat.name} Spending',
                        'message': f'You\'ve spent {pct}% more on {cat.name} than your '
                               f'3-month average of ₹{float(avg):,.2f}.',
                        'priority': 'medium',
                    })

        return insights

    def _savings_analysis(self):
        insights = []
        current = self._get_month_transactions()
        income = current.filter(type='income').aggregate(t=Sum('amount'))['t'] or Decimal('0')
        expense = current.filter(type='expense').aggregate(t=Sum('amount'))['t'] or Decimal('0')

        if income > 0:
            savings_rate = float((income - expense) / income * 100)
            if savings_rate < 10:
                insights.append({
                    'type': 'warning',
                    'icon': 'piggy-bank',
                    'title': 'Low Savings Rate',
                    'message': f'Your savings rate is only {round(savings_rate, 1)}%. '
                               f'Financial experts recommend saving at least 20% of income.',
                    'priority': 'high',
                })
            elif savings_rate >= 30:
                insights.append({
                    'type': 'success',
                    'icon': 'award',
                    'title': 'Excellent Savings Rate!',
                    'message': f'You\'re saving {round(savings_rate, 1)}% of your income. '
                               f'Outstanding financial discipline!',
                    'priority': 'low',
                })

        return insights

    def _spending_velocity(self):
        insights = []
        days_passed = self.today.day
        if days_passed < 5:
            return insights

        days_in_month = 30
        current_expenses = self._get_month_transactions().filter(
            type='expense'
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        daily_avg = float(current_expenses) / days_passed
        projected = daily_avg * days_in_month

        prev_month = self.current_month - 1 if self.current_month > 1 else 12
        prev_year = self.current_year if self.current_month > 1 else self.current_year - 1
        prev_total = Transaction.objects.filter(
            user=self.user, type='expense',
            date__month=prev_month, date__year=prev_year,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        if float(prev_total) > 0 and projected > float(prev_total) * 1.2:
            insights.append({
                'type': 'warning',
                'icon': 'activity',
                'title': 'On Track to Overspend',
                'message': f'At your current pace, you\'ll spend approximately '
                           f'₹{projected:,.2f} this month — {round((projected / float(prev_total) - 1) * 100, 1)}% '
                           f'more than last month\'s ₹{float(prev_total):,.2f}.',
                'priority': 'high',
            })

        return insights

    def _top_spending_categories(self):
        insights = []
        top = (
            self._get_month_transactions()
            .filter(type='expense')
            .values('category__name')
            .annotate(total=Sum('amount'))
            .order_by('-total')[:3]
        )

        if top:
            names = [f"{item['category__name']} (₹{float(item['total']):,.2f})" for item in top]
            insights.append({
                'type': 'info',
                'icon': 'list',
                'title': 'Top Spending Categories',
                'message': f'Your biggest expenses this month: {", ".join(names)}.',
                'priority': 'low',
            })

        return insights

    def _income_analysis(self):
        insights = []
        current_income = self._get_month_transactions().filter(
            type='income'
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        prev_month = self.current_month - 1 if self.current_month > 1 else 12
        prev_year = self.current_year if self.current_month > 1 else self.current_year - 1
        prev_income = Transaction.objects.filter(
            user=self.user, type='income',
            date__month=prev_month, date__year=prev_year,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        if prev_income > 0 and current_income < prev_income * Decimal('0.8'):
            drop = round(float((prev_income - current_income) / prev_income * 100), 1)
            insights.append({
                'type': 'info',
                'icon': 'rupee-sign',
                'title': 'Income Decrease Noticed',
                'message': f'Your income dropped by {drop}% compared to last month. '
                           f'Consider adjusting your budget accordingly.',
                'priority': 'medium',
            })

        return insights

    def _tax_optimization(self):
        insights = []

        try:
            tax_service = TaxOptimizerService(self.user, self.current_year)
            suggestions = tax_service.get_suggestions()[:2]
        except Exception:
            return insights

        for item in suggestions:
            insights.append({
                'type': item.get('type', 'info'),
                'icon': 'shield',
                'title': item.get('title', 'Tax Optimization Opportunity'),
                'message': item.get('message', ''),
                'priority': item.get('priority', 'medium'),
            })

        return insights
