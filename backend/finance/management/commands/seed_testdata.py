"""
Management command to create test user 'Sachin' and seed comprehensive test data
across all models: Accounts, Transactions, Budgets, SavingsGoals, Subscriptions.

Usage:  python manage.py seed_testdata
"""

import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from users.models import User
from finance.models import Account, Category, Transaction, Budget, SavingsGoal, Subscription


class Command(BaseCommand):
    help = 'Create test user Sachin with rich test data for all pages'

    def handle(self, *args, **options):
        # ── 1. Create or get user ────────────────────────────────────
        user, created = User.objects.get_or_create(
            email='sachin@test.com',
            defaults={
                'username': 'sachin',
                'first_name': 'Sachin',
                'last_name': 'Verma',
                'currency': 'INR',
            }
        )
        if created:
            user.set_password('Test@1234')
            user.save()
            self.stdout.write(self.style.SUCCESS('Created user: sachin@test.com / Test@1234'))
        else:
            self.stdout.write('User sachin@test.com already exists – reusing.')

        # ── 2. Ensure default categories exist ───────────────────────
        if Category.objects.filter(is_default=True).count() == 0:
            from django.core.management import call_command
            call_command('create_defaults')

        cats = {c.name: c for c in Category.objects.filter(is_default=True)}
        self.stdout.write(f'Found {len(cats)} default categories.')

        # ── 3. Accounts ──────────────────────────────────────────────
        accounts_data = [
            {'name': 'SBI Savings',   'type': 'bank',   'balance': 125000, 'icon': 'credit-card', 'color': '#3b82f6', 'is_default': True},
            {'name': 'Cash Wallet',   'type': 'cash',   'balance': 8500,   'icon': 'wallet',      'color': '#10b981'},
            {'name': 'PhonePe',       'type': 'upi',    'balance': 3200,   'icon': 'smartphone',  'color': '#8b5cf6'},
            {'name': 'HDFC Credit',   'type': 'credit', 'balance': -15400, 'icon': 'credit-card', 'color': '#ef4444'},
            {'name': 'Paytm Wallet',  'type': 'wallet', 'balance': 1800,   'icon': 'wallet',      'color': '#f59e0b'},
        ]
        acct_objs = {}
        for ad in accounts_data:
            obj, _ = Account.objects.get_or_create(
                user=user, name=ad['name'],
                defaults={k: v for k, v in ad.items() if k != 'name'}
            )
            acct_objs[ad['name']] = obj
        self.stdout.write(self.style.SUCCESS(f'  Accounts: {len(acct_objs)}'))

        default_acct = acct_objs['SBI Savings']

        # ── 4. Transactions (last 6 months, ~200 transactions) ──────
        today = date.today()
        Transaction.objects.filter(user=user).delete()  # fresh seed

        txns = []

        # ----- Income templates -----
        income_templates = [
            # (category_name, amount_range, merchant, notes, account_name)
            ('Salary',       (65000, 72000), 'TechCorp India',     'Monthly salary credit',      'SBI Savings'),
            ('Freelance',    (8000, 25000),  'Upwork',             'Freelance project payment',  'PhonePe'),
            ('Freelance',    (5000, 15000),  'Fiverr',             'Logo design project',        'PhonePe'),
            ('Investments',  (2000, 8000),   'Zerodha',            'Dividend credit',            'SBI Savings'),
            ('Investments',  (1000, 5000),   'Groww',              'Mutual fund returns',        'SBI Savings'),
            ('Other Income', (500, 3000),    'GPay',               'Cashback reward',            'PhonePe'),
            ('Other Income', (1000, 5000),   'Family',             'Gift received',              'Cash Wallet'),
        ]

        # ----- Expense templates -----
        expense_templates = [
            ('Food & Dining',    (150, 600),   'Swiggy',           'Food delivery',              'PhonePe'),
            ('Food & Dining',    (200, 800),   'Zomato',           'Dinner ordered',             'PhonePe'),
            ('Food & Dining',    (100, 400),   'Dominos',          'Pizza night',                'Cash Wallet'),
            ('Food & Dining',    (80, 250),    'Local Cafe',       'Coffee & snacks',            'Cash Wallet'),
            ('Food & Dining',    (300, 1200),  'Restaurant',       'Weekend dining out',         'HDFC Credit'),
            ('Transportation',   (50, 300),    'Uber',             'Cab ride',                   'PhonePe'),
            ('Transportation',   (100, 500),   'Ola',              'Office commute',             'PhonePe'),
            ('Transportation',   (2000, 4000), 'Indian Oil',       'Petrol fill-up',             'SBI Savings'),
            ('Transportation',   (30, 100),    'Metro',            'Metro pass recharge',        'Cash Wallet'),
            ('Housing',          (12000, 15000),'Landlord',        'Monthly rent',               'SBI Savings'),
            ('Housing',          (500, 2000),  'Urban Company',    'Plumbing / AC repair',       'PhonePe'),
            ('Utilities',        (800, 1500),  'BESCOM',           'Electricity bill',           'SBI Savings'),
            ('Utilities',        (400, 800),   'BWSSB',            'Water bill',                 'SBI Savings'),
            ('Utilities',        (600, 1200),  'Jio',              'Mobile recharge + broadband','PhonePe'),
            ('Utilities',        (200, 500),   'Airtel',           'DTH recharge',               'PhonePe'),
            ('Entertainment',    (199, 199),   'Netflix',          'Netflix subscription',       'HDFC Credit'),
            ('Entertainment',    (149, 149),   'Spotify',          'Spotify premium',            'HDFC Credit'),
            ('Entertainment',    (299, 499),   'Amazon Prime',     'Prime membership',           'HDFC Credit'),
            ('Entertainment',    (200, 800),   'PVR Cinemas',      'Movie tickets',              'PhonePe'),
            ('Entertainment',    (300, 1500),  'BookMyShow',       'Concert / event tickets',    'PhonePe'),
            ('Shopping',         (500, 3000),  'Amazon',           'Online shopping',            'HDFC Credit'),
            ('Shopping',         (800, 5000),  'Flipkart',         'Electronics / gadgets',      'HDFC Credit'),
            ('Shopping',         (300, 2000),  'Myntra',           'Clothing purchase',          'HDFC Credit'),
            ('Shopping',         (200, 1000),  'Decathlon',        'Sports gear',                'SBI Savings'),
            ('Healthcare',       (300, 1500),  'Apollo Pharmacy',  'Medicines',                  'Cash Wallet'),
            ('Healthcare',       (500, 3000),  'Hospital',         'Doctor consultation',        'SBI Savings'),
            ('Healthcare',       (1000, 5000), 'Lab Tests',        'Blood test / health checkup','SBI Savings'),
            ('Education',        (500, 3000),  'Udemy',            'Online course',              'HDFC Credit'),
            ('Education',        (1000, 5000), 'Coursera',         'Professional certification', 'HDFC Credit'),
            ('Education',        (200, 800),   'Amazon Books',     'Technical books',            'PhonePe'),
            ('Subscriptions',    (129, 129),   'iCloud',           'iCloud storage',             'HDFC Credit'),
            ('Subscriptions',    (499, 499),   'ChatGPT Plus',     'AI subscription',            'HDFC Credit'),
            ('Insurance',        (1500, 3000), 'LIC',              'Life insurance premium',     'SBI Savings'),
            ('Insurance',        (800, 2000),  'ICICI Lombard',    'Health insurance',           'SBI Savings'),
            ('Personal Care',    (300, 1200),  'Salon',            'Haircut & grooming',         'Cash Wallet'),
            ('Personal Care',    (200, 800),   'Nykaa',            'Skincare products',          'PhonePe'),
            ('Other Expense',    (100, 500),   'Miscellaneous',    'Misc small purchase',        'Cash Wallet'),
            ('Other Expense',    (200, 1000),  'ATM',              'ATM withdrawal',             'SBI Savings'),
        ]

        for month_offset in range(6, -1, -1):  # 6 months ago → today
            m_date = today.replace(day=1) - timedelta(days=30 * month_offset)
            m_year, m_month = m_date.year, m_date.month

            # --- Salary (once per month) ---
            txns.append(self._tx(
                user, 'income', Decimal(random.randint(65000, 72000)),
                cats['Salary'], acct_objs['SBI Savings'],
                date(m_year, m_month, 1), 'Monthly salary credit', 'TechCorp India'
            ))

            # --- 2-3 freelance / investment incomes per month ---
            for _ in range(random.randint(2, 4)):
                tpl = random.choice(income_templates[1:])  # skip Salary
                cat = cats.get(tpl[0])
                if not cat:
                    continue
                day = random.randint(1, 28)
                txns.append(self._tx(
                    user, 'income',
                    Decimal(random.randint(tpl[1][0], tpl[1][1])),
                    cat, acct_objs.get(tpl[4], default_acct),
                    date(m_year, m_month, day), tpl[3], tpl[2]
                ))

            # --- 20-30 expenses per month ---
            for _ in range(random.randint(20, 30)):
                tpl = random.choice(expense_templates)
                cat = cats.get(tpl[0])
                if not cat:
                    continue
                day = random.randint(1, 28)
                amt = random.randint(tpl[1][0], tpl[1][1])
                is_sub = tpl[0] in ('Subscriptions', 'Entertainment') and tpl[1][0] == tpl[1][1]
                txns.append(self._tx(
                    user, 'expense',
                    Decimal(amt), cat, acct_objs.get(tpl[4], default_acct),
                    date(m_year, m_month, day), tpl[3], tpl[2],
                    is_subscription=is_sub
                ))

        Transaction.objects.bulk_create(txns)
        self.stdout.write(self.style.SUCCESS(f'  Transactions: {len(txns)}'))

        # ── 5. Budgets (current month + last 2 months) ───────────────
        Budget.objects.filter(user=user).delete()
        budget_cats = {
            'Food & Dining':   6000,
            'Transportation':  4000,
            'Housing':        15000,
            'Utilities':       3000,
            'Entertainment':   3000,
            'Shopping':        5000,
            'Healthcare':      3000,
            'Education':       4000,
            'Subscriptions':   1500,
            'Insurance':       3500,
            'Personal Care':   2000,
            'Other Expense':   2000,
        }
        budgets = []
        for month_offset in range(2, -1, -1):
            b_date = today.replace(day=1) - timedelta(days=30 * month_offset)
            for cat_name, amt in budget_cats.items():
                cat = cats.get(cat_name)
                if not cat:
                    continue
                budgets.append(Budget(
                    user=user, category=cat,
                    amount=Decimal(amt),
                    month=b_date.month, year=b_date.year
                ))
        Budget.objects.bulk_create(budgets)
        self.stdout.write(self.style.SUCCESS(f'  Budgets: {len(budgets)}'))

        # ── 6. Savings Goals ─────────────────────────────────────────
        SavingsGoal.objects.filter(user=user).delete()
        goals_data = [
            {'name': 'Emergency Fund',      'target': 200000, 'current': 85000,  'deadline': today + timedelta(days=365),     'icon': 'shield'},
            {'name': 'Goa Trip',            'target': 30000,  'current': 22000,  'deadline': today + timedelta(days=90),      'icon': 'map-pin'},
            {'name': 'New Laptop',          'target': 80000,  'current': 45000,  'deadline': today + timedelta(days=180),     'icon': 'monitor'},
            {'name': 'Wedding Fund',        'target': 500000, 'current': 120000, 'deadline': today + timedelta(days=730),     'icon': 'heart'},
            {'name': 'Course Fee (AWS)',     'target': 15000,  'current': 15000,  'deadline': today - timedelta(days=10),      'icon': 'book'},
            {'name': 'iPhone 16',           'target': 90000,  'current': 30000,  'deadline': today + timedelta(days=270),     'icon': 'smartphone'},
            {'name': 'Mutual Fund SIP Lump','target': 100000, 'current': 60000,  'deadline': today + timedelta(days=200),     'icon': 'trending-up'},
        ]
        goals = [
            SavingsGoal(
                user=user,
                name=g['name'],
                target_amount=Decimal(g['target']),
                current_amount=Decimal(g['current']),
                deadline=g['deadline'],
                icon=g['icon']
            ) for g in goals_data
        ]
        SavingsGoal.objects.bulk_create(goals)
        self.stdout.write(self.style.SUCCESS(f'  Savings Goals: {len(goals)}'))

        # ── 7. Subscriptions ─────────────────────────────────────────
        Subscription.objects.filter(user=user).delete()
        subs_data = [
            {'name': 'Netflix',        'amount': 199,  'cat': 'Entertainment',  'freq': 'monthly', 'days': 30},
            {'name': 'Spotify',        'amount': 149,  'cat': 'Entertainment',  'freq': 'monthly', 'days': 30},
            {'name': 'Amazon Prime',   'amount': 1499, 'cat': 'Entertainment',  'freq': 'yearly',  'days': 365},
            {'name': 'ChatGPT Plus',   'amount': 499,  'cat': 'Subscriptions',  'freq': 'monthly', 'days': 30},
            {'name': 'iCloud 50 GB',   'amount': 129,  'cat': 'Subscriptions',  'freq': 'monthly', 'days': 30},
            {'name': 'Jio Postpaid',   'amount': 599,  'cat': 'Utilities',      'freq': 'monthly', 'days': 30},
            {'name': 'GitHub Pro',     'amount': 330,  'cat': 'Subscriptions',  'freq': 'monthly', 'days': 30},
            {'name': 'YouTube Premium','amount': 149,  'cat': 'Entertainment',  'freq': 'monthly', 'days': 30},
            {'name': 'LIC Premium',    'amount': 2500, 'cat': 'Insurance',      'freq': 'yearly',  'days': 365},
            {'name': 'Gym Membership', 'amount': 1500, 'cat': 'Personal Care',  'freq': 'monthly', 'days': 30},
        ]
        subs = []
        for sd in subs_data:
            cat = cats.get(sd['cat'])
            subs.append(Subscription(
                user=user,
                name=sd['name'],
                amount=Decimal(sd['amount']),
                category=cat,
                frequency=sd['freq'],
                is_active=True,
                detected_auto=False,
                next_date=today + timedelta(days=random.randint(1, sd['days']))
            ))
        Subscription.objects.bulk_create(subs)
        self.stdout.write(self.style.SUCCESS(f'  Subscriptions: {len(subs)}'))

        # ── Done ──────────────────────────────────────────────────────
        self.stdout.write(self.style.SUCCESS(
            f'\n✅  Seed complete for user "{user.first_name} {user.last_name}" '
            f'({user.email}).  Login: sachin@test.com / Test@1234'
        ))

    # Helper
    @staticmethod
    def _tx(user, tx_type, amount, category, account, tx_date, notes, merchant,
            is_subscription=False):
        return Transaction(
            user=user, type=tx_type, amount=amount,
            category=category, account=account,
            date=tx_date, notes=notes, merchant=merchant,
            is_subscription=is_subscription, auto_categorized=False
        )
