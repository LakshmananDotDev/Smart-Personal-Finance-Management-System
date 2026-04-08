from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from finance.models import Category, Transaction


class AdminApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin_user = user_model.objects.create_user(
            username='platform-admin',
            email='platform-admin@example.com',
            password='SecurePass123!',
            role='admin',
        )
        self.member_user = user_model.objects.create_user(
            username='member-user',
            email='member-user@example.com',
            password='SecurePass123!',
            role='member',
        )
        self.superuser = user_model.objects.create_superuser(
            username='django-superuser',
            email='superuser@example.com',
            password='SecurePass123!',
        )

        category = Category.objects.create(name='Food', type='expense', is_default=True)
        Transaction.objects.create(
            user=self.member_user,
            type='expense',
            amount='500.00',
            category=category,
            date='2026-04-01',
            notes='Lunch',
        )

    def test_non_admin_cannot_access_admin_overview(self):
        self.client.force_authenticate(user=self.member_user)
        response = self.client.get('/api/auth/admin/overview/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_login_endpoint_accepts_only_admin_role(self):
        member_attempt = self.client.post('/api/auth/admin/login/', {
            'email': self.member_user.email,
            'password': 'SecurePass123!',
        }, format='json')
        self.assertEqual(member_attempt.status_code, status.HTTP_403_FORBIDDEN)

        admin_attempt = self.client.post('/api/auth/admin/login/', {
            'email': self.admin_user.email,
            'password': 'SecurePass123!',
        }, format='json')
        self.assertEqual(admin_attempt.status_code, status.HTTP_200_OK)
        self.assertIn('token', admin_attempt.data)

        superuser_attempt = self.client.post('/api/auth/admin/login/', {
            'email': self.superuser.email,
            'password': 'SecurePass123!',
        }, format='json')
        self.assertEqual(superuser_attempt.status_code, status.HTTP_200_OK)
        self.assertIn('token', superuser_attempt.data)

    def test_admin_can_read_overview_and_manage_users(self):
        self.client.force_authenticate(user=self.admin_user)

        overview = self.client.get('/api/auth/admin/overview/')
        self.assertEqual(overview.status_code, status.HTTP_200_OK)
        self.assertIn('users', overview.data)
        self.assertIn('finance', overview.data)

        listing = self.client.get('/api/auth/admin/users/')
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertIn('results', listing.data)
        self.assertGreaterEqual(listing.data.get('count', 0), 2)

        update = self.client.patch(
            f'/api/auth/admin/users/{self.member_user.id}/',
            {'role': 'support', 'plan': 'premium'},
            format='json',
        )
        self.assertEqual(update.status_code, status.HTTP_200_OK)

        self.member_user.refresh_from_db()
        self.assertEqual(self.member_user.role, 'support')
        self.assertEqual(self.member_user.plan, 'premium')

    def test_admin_cannot_remove_own_admin_role(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(
            f'/api/auth/admin/users/{self.admin_user.id}/',
            {'role': 'member'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
