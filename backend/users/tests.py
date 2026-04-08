import hashlib
import hmac
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from finance.models import Account, Budget, Category, GoalContribution, SavingsGoal, Subscription, Transaction


class CurrencyConversionTests(APITestCase):
	def setUp(self):
		user_model = get_user_model()
		self.user = user_model.objects.create_user(
			username='currency-user',
			email='currency-user@example.com',
			password='SecurePass123!',
			currency='INR',
			monthly_income=Decimal('60000.00'),
		)
		self.client.force_authenticate(user=self.user)

		self.category = Category.objects.create(
			name='General',
			type='expense',
			is_default=True,
		)

		self.account = Account.objects.create(
			user=self.user,
			name='Main Account',
			type='bank',
			balance=Decimal('8300.00'),
		)

		self.transaction = Transaction.objects.create(
			user=self.user,
			type='expense',
			amount=Decimal('8300.00'),
			category=self.category,
			date=date.today(),
			notes='Sample expense',
		)

		self.budget = Budget.objects.create(
			user=self.user,
			category=self.category,
			amount=Decimal('83000.00'),
			month=1,
			year=date.today().year,
		)

		self.subscription = Subscription.objects.create(
			user=self.user,
			name='Streaming',
			amount=Decimal('830.00'),
			frequency='monthly',
			is_active=True,
		)

		self.goal = SavingsGoal.objects.create(
			user=self.user,
			name='Emergency Fund',
			target_amount=Decimal('83000.00'),
			current_amount=Decimal('41500.00'),
		)

		self.contribution = GoalContribution.objects.create(
			goal=self.goal,
			amount=Decimal('8300.00'),
			account=self.account,
			transaction=self.transaction,
			notes='Initial add',
		)

	def test_profile_currency_change_converts_financial_amounts(self):
		response = self.client.patch('/api/auth/profile/', {
			'currency': 'USD',
		}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['currency'], 'USD')

		self.user.refresh_from_db()
		self.account.refresh_from_db()
		self.transaction.refresh_from_db()
		self.budget.refresh_from_db()
		self.subscription.refresh_from_db()
		self.goal.refresh_from_db()
		self.contribution.refresh_from_db()

		self.assertEqual(self.account.balance, Decimal('100.00'))
		self.assertEqual(self.transaction.amount, Decimal('100.00'))
		self.assertEqual(self.budget.amount, Decimal('1000.00'))
		self.assertEqual(self.subscription.amount, Decimal('10.00'))
		self.assertEqual(self.goal.target_amount, Decimal('1000.00'))
		self.assertEqual(self.goal.current_amount, Decimal('500.00'))
		self.assertEqual(self.contribution.amount, Decimal('100.00'))
		self.assertEqual(self.user.monthly_income, Decimal('722.89'))

	def test_profile_rejects_unsupported_currency(self):
		response = self.client.patch('/api/auth/profile/', {
			'currency': 'AUD',
		}, format='json')

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn('currency', response.data)


class PremiumBillingTests(APITestCase):
	def setUp(self):
		user_model = get_user_model()
		self.user = user_model.objects.create_user(
			username='premium-user',
			email='premium-user@example.com',
			password='SecurePass123!'
		)
		self.client.force_authenticate(user=self.user)

	def test_entitlements_returns_basic_plan_defaults(self):
		response = self.client.get('/api/auth/entitlements/')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['plan'], 'basic')
		self.assertFalse(response.data['is_premium'])
		self.assertEqual(response.data['limits']['accounts'], 2)

	@override_settings(RAZORPAY_KEY_ID='rzp_test_key', RAZORPAY_KEY_SECRET='test_secret_key')
	@patch('users.views._razorpay_request')
	def test_verify_payment_activates_premium(self, mock_razorpay_request):
		mock_razorpay_request.return_value = {
			'id': 'pay_123',
			'order_id': 'order_123',
			'status': 'captured',
			'amount': 14900,
		}

		signature = hmac.new(
			b'test_secret_key',
			b'order_123|pay_123',
			hashlib.sha256,
		).hexdigest()

		response = self.client.post('/api/auth/premium/verify/', {
			'plan': 'monthly',
			'razorpay_order_id': 'order_123',
			'razorpay_payment_id': 'pay_123',
			'razorpay_signature': signature,
		}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.user.refresh_from_db()
		self.assertEqual(self.user.plan, 'premium')
		self.assertIsNotNone(self.user.premium_expires_at)
		self.assertGreater(self.user.premium_expires_at, timezone.now() + timedelta(days=29))
