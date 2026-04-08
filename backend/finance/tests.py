from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from finance.models import Category, Transaction


class SpendingMapApiTests(APITestCase):
	def setUp(self):
		user_model = get_user_model()
		self.user = user_model.objects.create_user(
			username='map-user',
			email='map-user@example.com',
			password='SecurePass123!'
		)
		self.client.force_authenticate(user=self.user)
		self.category = Category.objects.create(
			name='Food',
			type='expense',
			is_default=True,
		)

	def _expense(self, amount, tx_date, location, lat, lng):
		return Transaction.objects.create(
			user=self.user,
			type='expense',
			amount=Decimal(str(amount)),
			category=self.category,
			date=tx_date,
			notes='Test expense',
			location_name=location,
			latitude=Decimal(str(lat)),
			longitude=Decimal(str(lng)),
		)

	def test_spending_map_aggregates_hotspots(self):
		today = date.today()

		self._expense(1200, today, 'Koramangala, Bengaluru', 12.935, 77.614)
		self._expense(300, today, 'Koramangala, Bengaluru', 12.935, 77.614)
		self._expense(500, today, 'Indiranagar, Bengaluru', 12.978, 77.640)

		Transaction.objects.create(
			user=self.user,
			type='income',
			amount=Decimal('9999.00'),
			category=None,
			date=today,
			notes='Salary',
			location_name='Koramangala, Bengaluru',
			latitude=Decimal('12.935000'),
			longitude=Decimal('77.614000'),
		)

		response = self.client.get('/api/finance/transactions/spending-map/')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['hotspot_count'], 2)
		self.assertAlmostEqual(response.data['total_mapped_expense'], 2000.0)

		first = response.data['hotspots'][0]
		self.assertEqual(first['location_name'], 'Koramangala, Bengaluru')
		self.assertEqual(first['transaction_count'], 2)
		self.assertAlmostEqual(first['total_spent'], 1500.0)

	def test_spending_map_respects_month_year_filter(self):
		today = date.today()
		last_year = date(today.year - 1, min(today.month, 12), 15)

		self._expense(250, today, 'Mumbai', 19.076, 72.877)
		self._expense(400, last_year, 'Mumbai', 19.076, 72.877)

		response = self.client.get('/api/finance/transactions/spending-map/', {
			'month': today.month,
			'year': today.year,
		})

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['hotspot_count'], 1)
		self.assertAlmostEqual(response.data['total_mapped_expense'], 250.0)


class TransactionTaxTaggingTests(APITestCase):
	def setUp(self):
		user_model = get_user_model()
		self.user = user_model.objects.create_user(
			username='tax-tag-user',
			email='tax-tag-user@example.com',
			password='SecurePass123!'
		)
		self.client.force_authenticate(user=self.user)

	def test_transaction_auto_tags_tax_section_and_clears_on_income(self):
		create_response = self.client.post('/api/finance/transactions/', {
			'type': 'expense',
			'amount': '5000.00',
			'date': date.today().isoformat(),
			'notes': 'LIC premium payment',
		}, format='json')

		self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(create_response.data.get('tax_section'), '80C')

		tx_id = create_response.data['id']
		patch_response = self.client.patch(f'/api/finance/transactions/{tx_id}/', {
			'type': 'income',
		}, format='json')

		self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
		self.assertEqual(patch_response.data.get('tax_section'), '')


class BasicPlanLimitsTests(APITestCase):
	def setUp(self):
		user_model = get_user_model()
		self.user = user_model.objects.create_user(
			username='limits-user',
			email='limits-user@example.com',
			password='SecurePass123!'
		)
		self.client.force_authenticate(user=self.user)

	def _create_account(self, name):
		return self.client.post('/api/finance/accounts/', {
			'name': name,
			'type': 'bank',
			'balance': '1000.00',
		}, format='json')

	def test_basic_plan_limits_accounts_to_two(self):
		first = self._create_account('Primary')
		second = self._create_account('Secondary')
		third = self._create_account('Travel')

		self.assertEqual(first.status_code, status.HTTP_201_CREATED)
		self.assertEqual(second.status_code, status.HTTP_201_CREATED)
		self.assertEqual(third.status_code, status.HTTP_403_FORBIDDEN)
		self.assertEqual(third.data.get('error_code'), 'plan_limit_reached')
		self.assertEqual(third.data.get('resource'), 'accounts')
