from django.core.management.base import BaseCommand
from finance.models import Category


DEFAULT_CATEGORIES = [
    {'name': 'Salary', 'type': 'income', 'icon': 'briefcase', 'color': '#10b981'},
    {'name': 'Freelance', 'type': 'income', 'icon': 'code', 'color': '#06b6d4'},
    {'name': 'Investments', 'type': 'income', 'icon': 'trending-up', 'color': '#8b5cf6'},
    {'name': 'Other Income', 'type': 'income', 'icon': 'plus-circle', 'color': '#6366f1'},
    {'name': 'Food & Dining', 'type': 'expense', 'icon': 'coffee', 'color': '#f59e0b'},
    {'name': 'Transportation', 'type': 'expense', 'icon': 'truck', 'color': '#3b82f6'},
    {'name': 'Housing', 'type': 'expense', 'icon': 'home', 'color': '#ef4444'},
    {'name': 'Utilities', 'type': 'expense', 'icon': 'zap', 'color': '#f97316'},
    {'name': 'Entertainment', 'type': 'expense', 'icon': 'film', 'color': '#ec4899'},
    {'name': 'Shopping', 'type': 'expense', 'icon': 'shopping-bag', 'color': '#a855f7'},
    {'name': 'Healthcare', 'type': 'expense', 'icon': 'heart', 'color': '#14b8a6'},
    {'name': 'Education', 'type': 'expense', 'icon': 'book', 'color': '#6366f1'},
    {'name': 'Subscriptions', 'type': 'expense', 'icon': 'repeat', 'color': '#8b5cf6'},
    {'name': 'Insurance', 'type': 'expense', 'icon': 'shield', 'color': '#64748b'},
    {'name': 'Personal Care', 'type': 'expense', 'icon': 'smile', 'color': '#f472b6'},
    {'name': 'Savings', 'type': 'expense', 'icon': 'piggy-bank', 'color': '#10b981'},
    {'name': 'Other Expense', 'type': 'expense', 'icon': 'more-horizontal', 'color': '#94a3b8'},
]


class Command(BaseCommand):
    help = 'Create default transaction categories'

    def handle(self, *args, **options):
        created = 0
        for cat_data in DEFAULT_CATEGORIES:
            _, was_created = Category.objects.get_or_create(
                name=cat_data['name'],
                is_default=True,
                defaults={
                    'type': cat_data['type'],
                    'icon': cat_data['icon'],
                    'color': cat_data['color'],
                }
            )
            if was_created:
                created += 1

        self.stdout.write(
            self.style.SUCCESS(f'Created {created} default categories.')
        )
