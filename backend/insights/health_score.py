"""
Financial Health Score Calculator.
Computes a 0-100 score based on multiple financial health indicators.
"""

from datetime import date
from decimal import Decimal
from django.db.models import Sum, Avg
from finance.models import Transaction, Budget, SavingsGoal


class HealthScoreCalculator:
    def __init__(self, user):
        self.user = user
        self.today = date.today()
        self.month = self.today.month
        self.year = self.today.year

    def calculate(self):
        scores = {
            'savings_rate': self._savings_rate_score(),
            'expense_ratio': self._expense_ratio_score(),
            'budget_adherence': self._budget_adherence_score(),
            'spending_consistency': self._spending_consistency_score(),
            'goal_progress': self._goal_progress_score(),
        }

        weights = {
            'savings_rate': 0.30,
            'expense_ratio': 0.20,
            'budget_adherence': 0.25,
            'spending_consistency': 0.15,
            'goal_progress': 0.10,
        }

        total = sum(scores[k]['score'] * weights[k] for k in scores)
        total = round(min(max(total, 0), 100))

        return {
            'score': total,
            'grade': self._get_grade(total),
            'breakdown': scores,
            'suggestions': self._generate_suggestions(scores),
        }

    def _savings_rate_score(self):
        income = Transaction.objects.filter(
            user=self.user, type='income',
            date__month=self.month, date__year=self.year,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        expenses = Transaction.objects.filter(
            user=self.user, type='expense',
            date__month=self.month, date__year=self.year,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        if income == 0:
            rate = 0
        else:
            rate = float((income - expenses) / income * 100)

        # Score: 20%+ savings = 100, 0% = 0, negative = 0
        score = min(max(rate / 20 * 100, 0), 100)

        return {
            'score': round(score),
            'value': round(rate, 1),
            'label': 'Savings Rate',
            'detail': f'{round(rate, 1)}% of income saved',
        }

    def _expense_ratio_score(self):
        income = Transaction.objects.filter(
            user=self.user, type='income',
            date__month=self.month, date__year=self.year,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        expenses = Transaction.objects.filter(
            user=self.user, type='expense',
            date__month=self.month, date__year=self.year,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        if income == 0:
            ratio = 100
        else:
            ratio = float(expenses / income * 100)

        # Score: 50% ratio = 100, 100% = 0
        score = max((100 - ratio) * 2, 0)
        score = min(score, 100)

        return {
            'score': round(score),
            'value': round(ratio, 1),
            'label': 'Expense Ratio',
            'detail': f'{round(ratio, 1)}% of income spent',
        }

    def _budget_adherence_score(self):
        budgets = Budget.objects.filter(
            user=self.user, month=self.month, year=self.year,
        )

        if not budgets.exists():
            return {
                'score': 50,
                'value': 0,
                'label': 'Budget Adherence',
                'detail': 'No budgets set this month',
            }

        within = 0
        total = 0
        for b in budgets:
            total += 1
            spent = Transaction.objects.filter(
                user=self.user, type='expense',
                category=b.category,
                date__month=self.month, date__year=self.year,
            ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

            if spent <= b.amount:
                within += 1

        pct = (within / total * 100) if total > 0 else 0

        return {
            'score': round(pct),
            'value': round(pct, 1),
            'label': 'Budget Adherence',
            'detail': f'{within}/{total} budgets within limit',
        }

    def _spending_consistency_score(self):
        """Lower variance in daily spending = higher score."""
        from django.db.models import StdDev

        txs = Transaction.objects.filter(
            user=self.user, type='expense',
            date__month=self.month, date__year=self.year,
        )

        if txs.count() < 3:
            return {
                'score': 50,
                'value': 0,
                'label': 'Spending Consistency',
                'detail': 'Not enough data',
            }

        daily = (
            txs.values('date')
            .annotate(total=Sum('amount'))
            .aggregate(std=StdDev('total'), avg=Avg('total'))
        )

        avg = float(daily['avg'] or 0)
        std = float(daily['std'] or 0)

        if avg == 0:
            cv = 0
        else:
            cv = std / avg  # coefficient of variation

        # CV < 0.3 = very consistent (100), CV > 1.5 = very inconsistent (0)
        score = max(100 - cv * 66, 0)

        return {
            'score': round(min(score, 100)),
            'value': round(cv, 2),
            'label': 'Spending Consistency',
            'detail': f'Coefficient of variation: {round(cv, 2)}',
        }

    def _goal_progress_score(self):
        goals = SavingsGoal.objects.filter(user=self.user)

        if not goals.exists():
            return {
                'score': 50,
                'value': 0,
                'label': 'Goal Progress',
                'detail': 'No savings goals set',
            }

        total_progress = sum(g.progress for g in goals)
        avg_progress = total_progress / goals.count()

        return {
            'score': round(min(avg_progress, 100)),
            'value': round(avg_progress, 1),
            'label': 'Goal Progress',
            'detail': f'{round(avg_progress, 1)}% average goal completion',
        }

    def _get_grade(self, score):
        if score >= 90:
            return {'letter': 'A+', 'label': 'Excellent', 'color': '#00dc82'}
        elif score >= 80:
            return {'letter': 'A', 'label': 'Very Good', 'color': '#2ed573'}
        elif score >= 70:
            return {'letter': 'B+', 'label': 'Good', 'color': '#7bed9f'}
        elif score >= 60:
            return {'letter': 'B', 'label': 'Fair', 'color': '#ffa502'}
        elif score >= 50:
            return {'letter': 'C', 'label': 'Needs Improvement', 'color': '#ff6348'}
        else:
            return {'letter': 'D', 'label': 'Poor', 'color': '#ff4757'}

    def _generate_suggestions(self, scores):
        suggestions = []

        sr = scores['savings_rate']
        if sr['score'] < 50:
            suggestions.append({
                'icon': '💰',
                'text': 'Aim to save at least 20% of your income. '
                        'Start by cutting discretionary expenses.',
            })

        er = scores['expense_ratio']
        if er['score'] < 40:
            suggestions.append({
                'icon': '📉',
                'text': 'Your expenses are consuming most of your income. '
                        'Review subscriptions and dining expenses.',
            })

        ba = scores['budget_adherence']
        if ba['score'] < 60 and ba['value'] > 0:
            suggestions.append({
                'icon': '📊',
                'text': 'Several budgets are being exceeded. '
                        'Consider adjusting budget amounts or reducing spending.',
            })

        sc = scores['spending_consistency']
        if sc['score'] < 40:
            suggestions.append({
                'icon': '📅',
                'text': 'Your spending is very inconsistent. '
                        'Try planning weekly budgets for better control.',
            })

        gp = scores['goal_progress']
        if gp['score'] < 30 and gp['value'] > 0:
            suggestions.append({
                'icon': '🎯',
                'text': 'Your savings goals are falling behind. '
                        'Set up automatic transfers to stay on track.',
            })

        if not suggestions:
            suggestions.append({
                'icon': '🌟',
                'text': 'Great job! Keep maintaining your financial habits.',
            })

        return suggestions
