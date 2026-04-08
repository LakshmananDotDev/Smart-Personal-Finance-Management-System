from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from finance.models import Category, Transaction


class TaxApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username='tax-user',
            email='tax-user@example.com',
            password='SecurePass123!',
            plan='premium',
            premium_expires_at=timezone.now() + timedelta(days=30),
        )
        self.client.force_authenticate(user=self.user)

        self.income_category = Category.objects.create(
            name='Salary',
            type='income',
            is_default=True,
        )
        self.expense_category = Category.objects.create(
            name='Insurance',
            type='expense',
            is_default=True,
        )

        current_year = date.today().year

        Transaction.objects.create(
            user=self.user,
            type='income',
            amount=Decimal('1200000.00'),
            category=self.income_category,
            date=date(current_year, 4, 1),
            notes='Annual salary credit',
        )
        Transaction.objects.create(
            user=self.user,
            type='expense',
            amount=Decimal('60000.00'),
            category=self.expense_category,
            date=date(current_year, 6, 10),
            notes='LIC premium annual payment',
        )
        Transaction.objects.create(
            user=self.user,
            type='expense',
            amount=Decimal('18000.00'),
            category=self.expense_category,
            date=date(current_year, 7, 5),
            notes='Health insurance premium renewal',
        )

    def test_tax_summary_returns_deduction_sections(self):
        response = self.client.get('/api/tax/summary/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['year'], date.today().year)
        self.assertEqual(len(response.data['sections']), 2)

        sec_80c = [s for s in response.data['sections'] if s['section'] == '80C'][0]
        sec_80d = [s for s in response.data['sections'] if s['section'] == '80D'][0]

        self.assertAlmostEqual(sec_80c['eligible_deduction'], 60000.0)
        self.assertAlmostEqual(sec_80d['eligible_deduction'], 18000.0)

    def test_regime_comparison_returns_recommendation(self):
        response = self.client.get('/api/tax/regime-comparison/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(response.data['recommended_regime'], ['old', 'new', 'either'])
        self.assertIn('old_regime', response.data)
        self.assertIn('new_regime', response.data)

    def test_estimator_returns_monthly_liability(self):
        response = self.client.get('/api/tax/estimator/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data['estimated_annual_tax'], 0)
        self.assertGreaterEqual(response.data['monthly_tax_liability'], 0)

    def test_tax_suggestions_return_actionable_messages(self):
        response = self.client.get('/api/tax/suggestions/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data['count'], 1)
        titles = [item['title'].lower() for item in response.data['suggestions']]
        self.assertTrue(any('80c' in title or 'regime' in title for title in titles))
