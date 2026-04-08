"""
Goal-Based AI Planner.
Generates actionable savings plans to help users reach their financial goals.
"""

from datetime import date
from decimal import Decimal
from django.db.models import Sum, Avg
from finance.models import Transaction, SavingsGoal, Category, Budget


class GoalPlanner:
    def __init__(self, user):
        self.user = user
        self.today = date.today()

    def generate_plan(self, goal_id):
        """Generate a detailed savings plan for a specific goal."""
        try:
            goal = SavingsGoal.objects.get(id=goal_id, user=self.user)
        except SavingsGoal.DoesNotExist:
            return {'error': 'Goal not found'}

        remaining = float(goal.target_amount - goal.current_amount)
        if remaining <= 0:
            return {
                'goal': self._goal_data(goal),
                'status': 'completed',
                'message': 'Congratulations! You\'ve already reached this goal!',
            }

        # Calculate months remaining
        if goal.deadline:
            days_left = (goal.deadline - self.today).days
            months_left = max(days_left / 30, 1)
        else:
            months_left = 12  # Default to 12-month plan

        monthly_required = remaining / months_left

        # Analyze current spending for reduction suggestions
        suggestions = self._get_reduction_suggestions(monthly_required)

        # Get income and expense averages (last 3 months)
        avg_income, avg_expense = self._get_averages()
        current_savings = avg_income - avg_expense
        shortfall = monthly_required - current_savings

        return {
            'goal': self._goal_data(goal),
            'status': 'in_progress',
            'remaining_amount': round(remaining, 2),
            'months_left': round(months_left, 1),
            'monthly_required': round(monthly_required, 2),
            'current_monthly_savings': round(current_savings, 2),
            'shortfall': round(max(shortfall, 0), 2),
            'is_achievable': shortfall <= 0,
            'suggestions': suggestions,
        }

    def _goal_data(self, goal):
        return {
            'id': goal.id,
            'name': goal.name,
            'target': float(goal.target_amount),
            'current': float(goal.current_amount),
            'progress': goal.progress,
            'deadline': goal.deadline.isoformat() if goal.deadline else None,
        }

    def _get_averages(self):
        """Get 3-month average income and expenses."""
        from datetime import timedelta
        three_months_ago = self.today - timedelta(days=90)

        income = Transaction.objects.filter(
            user=self.user, type='income', date__gte=three_months_ago,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        expenses = Transaction.objects.filter(
            user=self.user, type='expense', date__gte=three_months_ago,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        return float(income) / 3, float(expenses) / 3

    def _get_reduction_suggestions(self, target_savings):
        """Suggest category-wise spending reductions to meet savings target."""
        from datetime import timedelta
        three_months_ago = self.today - timedelta(days=90)

        # Get average monthly spending by category
        category_spending = (
            Transaction.objects.filter(
                user=self.user, type='expense', date__gte=three_months_ago,
            )
            .values('category__id', 'category__name', 'category__icon')
            .annotate(total=Sum('amount'))
            .order_by('-total')
        )

        suggestions = []
        accumulated_savings = 0

        # Non-essential categories that can be reduced
        reducible = {
            'Entertainment', 'Shopping', 'Food & Dining', 'Travel',
            'Personal Care', 'Dining',
        }

        for cat in category_spending:
            cat_name = cat['category__name'] or 'Unknown'
            monthly_avg = float(cat['total']) / 3

            # Determine reduction percentage based on category type
            if cat_name in reducible:
                reduction_pct = 20  # 20% reduction for non-essentials
            else:
                reduction_pct = 10  # 10% for essentials

            potential_save = monthly_avg * reduction_pct / 100

            if potential_save > 0:
                suggestions.append({
                    'category_id': cat['category__id'],
                    'category': cat_name,
                    'icon': cat['category__icon'] or '📊',
                    'current_monthly': round(monthly_avg, 2),
                    'suggested_reduction_pct': reduction_pct,
                    'potential_savings': round(potential_save, 2),
                    'new_monthly': round(monthly_avg - potential_save, 2),
                })

                accumulated_savings += potential_save

                if accumulated_savings >= target_savings:
                    break

        return suggestions
