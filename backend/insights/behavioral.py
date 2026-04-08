"""
Behavioral Insights Engine.
Analyzes user spending behavior patterns and generates actionable insights.
Detects: weekend overspending, late-night spending, category spikes, impulse patterns.
"""

from datetime import date, timedelta
from decimal import Decimal
from collections import defaultdict
from django.db.models import Sum, Avg, Count, Q
from finance.models import Transaction


class BehavioralEngine:
    def __init__(self, user):
        self.user = user
        self.today = date.today()

    def analyze(self):
        insights = []
        insights.extend(self._weekend_overspending())
        insights.extend(self._spending_day_patterns())
        insights.extend(self._category_spikes())
        insights.extend(self._impulse_spending())
        insights.extend(self._payday_splurge())
        insights.extend(self._month_end_crunch())
        return insights

    def _weekend_overspending(self):
        """Compare weekend vs weekday spending."""
        insights = []
        thirty_days_ago = self.today - timedelta(days=30)

        txs = Transaction.objects.filter(
            user=self.user, type='expense', date__gte=thirty_days_ago,
        )

        weekend_total = Decimal('0')
        weekday_total = Decimal('0')
        weekend_days = 0
        weekday_days = 0

        # Count spending by weekday/weekend
        daily = txs.values('date').annotate(total=Sum('amount'))
        for d in daily:
            day_of_week = d['date'].weekday()
            if day_of_week >= 5:  # Saturday=5, Sunday=6
                weekend_total += d['total']
                weekend_days += 1
            else:
                weekday_total += d['total']
                weekday_days += 1

        if weekend_days > 0 and weekday_days > 0:
            weekend_avg = float(weekend_total) / weekend_days
            weekday_avg = float(weekday_total) / weekday_days

            if weekend_avg > weekday_avg * 1.5:
                pct_more = round((weekend_avg / weekday_avg - 1) * 100, 1)
                insights.append({
                    'type': 'warning',
                    'icon': '📅',
                    'title': 'Weekend Overspending Detected',
                    'message': f'You spend {pct_more}% more on weekends '
                               f'(₹{weekend_avg:,.0f}/day) vs weekdays '
                               f'(₹{weekday_avg:,.0f}/day). Try planning weekend activities in advance.',
                    'priority': 'medium',
                    'category': 'behavioral',
                })

        return insights

    def _spending_day_patterns(self):
        """Identify which days of the week have highest spending."""
        insights = []
        sixty_days_ago = self.today - timedelta(days=60)

        txs = Transaction.objects.filter(
            user=self.user, type='expense', date__gte=sixty_days_ago,
        )

        day_totals = defaultdict(float)
        day_counts = defaultdict(int)
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

        daily = txs.values('date').annotate(total=Sum('amount'))
        for d in daily:
            dow = d['date'].weekday()
            day_totals[dow] += float(d['total'])
            day_counts[dow] += 1

        if not day_totals:
            return insights

        day_avgs = {d: day_totals[d] / day_counts[d] for d in day_totals if day_counts[d] > 0}
        if day_avgs:
            peak_day = max(day_avgs, key=day_avgs.get)
            overall_avg = sum(day_avgs.values()) / len(day_avgs)

            if day_avgs[peak_day] > overall_avg * 1.4:
                insights.append({
                    'type': 'info',
                    'icon': '📊',
                    'title': f'{day_names[peak_day]}s Are Your Biggest Spending Day',
                    'message': f'You tend to spend ₹{day_avgs[peak_day]:,.0f} on average on '
                               f'{day_names[peak_day]}s — {round((day_avgs[peak_day] / overall_avg - 1) * 100)}% '
                               f'above your daily average.',
                    'priority': 'low',
                    'category': 'behavioral',
                })

        return insights

    def _category_spikes(self):
        """Detect unusual spikes in specific categories."""
        insights = []
        current_month_start = self.today.replace(day=1)

        # Current month spending by category
        current = (
            Transaction.objects.filter(
                user=self.user, type='expense', date__gte=current_month_start,
            )
            .values('category__name', 'category__id')
            .annotate(total=Sum('amount'))
        )

        for cat in current:
            cat_name = cat['category__name']
            cat_id = cat['category__id']
            current_total = float(cat['total'])

            # Compare to prior 3-month average
            three_months_ago = self.today - timedelta(days=90)
            prior = Transaction.objects.filter(
                user=self.user, type='expense',
                category_id=cat_id,
                date__gte=three_months_ago,
                date__lt=current_month_start,
            ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

            monthly_avg = float(prior) / 3

            # Scale current to full month projection
            days_in = max(self.today.day, 1)
            projected = current_total / days_in * 30

            if monthly_avg > 0 and projected > monthly_avg * 2:
                spike_pct = round((projected / monthly_avg - 1) * 100)
                insights.append({
                    'type': 'danger',
                    'icon': '📈',
                    'title': f'{cat_name} Spending Spike',
                    'message': f'Your projected {cat_name} spending (₹{projected:,.0f}) is '
                               f'{spike_pct}% higher than your 3-month average (₹{monthly_avg:,.0f}).',
                    'priority': 'high',
                    'category': 'behavioral',
                })

        return insights

    def _impulse_spending(self):
        """Detect days with many small transactions (impulse spending)."""
        insights = []
        thirty_days_ago = self.today - timedelta(days=30)

        daily_counts = (
            Transaction.objects.filter(
                user=self.user, type='expense', date__gte=thirty_days_ago,
            )
            .values('date')
            .annotate(count=Count('id'), total=Sum('amount'))
            .filter(count__gte=4)
            .order_by('-count')
        )

        high_count_days = list(daily_counts[:3])
        if high_count_days:
            avg_per_day = sum(d['count'] for d in high_count_days) / len(high_count_days)
            insights.append({
                'type': 'info',
                'icon': '⚡',
                'title': 'Possible Impulse Spending',
                'message': f'You had days with {int(avg_per_day)}+ transactions recently. '
                           f'Multiple small purchases can add up quickly. '
                           f'Consider consolidating purchases.',
                'priority': 'medium',
                'category': 'behavioral',
            })

        return insights

    def _payday_splurge(self):
        """Check if spending spikes right after month start (payday)."""
        insights = []
        first_week = Transaction.objects.filter(
            user=self.user, type='expense',
            date__month=self.today.month, date__year=self.today.year,
            date__day__lte=7,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        rest = Transaction.objects.filter(
            user=self.user, type='expense',
            date__month=self.today.month, date__year=self.today.year,
            date__day__gt=7,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        if self.today.day > 14 and float(first_week) > 0:
            rest_days = max(self.today.day - 7, 1)
            first_avg = float(first_week) / 7
            rest_avg = float(rest) / rest_days if rest_days > 0 else 0

            if first_avg > rest_avg * 1.8 and rest_avg > 0:
                insights.append({
                    'type': 'warning',
                    'icon': '💸',
                    'title': 'Payday Splurge Pattern',
                    'message': 'You tend to spend more in the first week of the month. '
                               'Try spreading purchases evenly across the month.',
                    'priority': 'medium',
                    'category': 'behavioral',
                })

        return insights

    def _month_end_crunch(self):
        """Detect if spending drops drastically at month end."""
        insights = []
        if self.today.day < 20:
            return insights

        # Compare first half vs current spending rate
        mid_month = self.today.replace(day=15)
        first_half = Transaction.objects.filter(
            user=self.user, type='expense',
            date__month=self.today.month, date__year=self.today.year,
            date__day__lte=15,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        second_half = Transaction.objects.filter(
            user=self.user, type='expense',
            date__month=self.today.month, date__year=self.today.year,
            date__day__gt=15,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        first_daily = float(first_half) / 15
        second_days = self.today.day - 15
        second_daily = float(second_half) / second_days if second_days > 0 else 0

        if first_daily > 0 and second_daily < first_daily * 0.4:
            insights.append({
                'type': 'info',
                'icon': '📉',
                'title': 'Month-End Spending Drop',
                'message': 'Your spending has dropped significantly in the second half. '
                           'This might mean you\'re running tight on budget. '
                           'Consider pacing expenses more evenly.',
                'priority': 'low',
                'category': 'behavioral',
            })

        return insights
