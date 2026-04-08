from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import RefreshToken, AuditLog, SignupEmailOTP


class AuthTokenSecurityTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.password = 'SecurePass123!'
        self.user = user_model.objects.create_user(
            username='security-user',
            email='security-user@example.com',
            password=self.password,
            phone_number='+919876543210',
        )

    def _login(self):
        response = self.client.post('/api/auth/login/', {
            'email': self.user.email,
            'password': self.password,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def test_login_returns_access_and_refresh_tokens(self):
        payload = self._login()
        self.assertIn('token', payload)
        self.assertIn('refresh_token', payload)
        self.assertEqual(payload.get('token_type'), 'Bearer')
        self.assertGreater(payload.get('expires_in', 0), 0)

    def test_refresh_rotates_refresh_token_and_revokes_old_one(self):
        login_payload = self._login()
        old_refresh_token = login_payload['refresh_token']

        refresh_response = self.client.post('/api/auth/refresh/', {
            'refresh_token': old_refresh_token,
        }, format='json')

        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertIn('token', refresh_response.data)
        self.assertIn('refresh_token', refresh_response.data)
        self.assertNotEqual(old_refresh_token, refresh_response.data['refresh_token'])

        # Old refresh token should no longer be valid after rotation.
        second_refresh = self.client.post('/api/auth/refresh/', {
            'refresh_token': old_refresh_token,
        }, format='json')
        self.assertEqual(second_refresh.status_code, status.HTTP_401_UNAUTHORIZED)

        self.assertEqual(RefreshToken.objects.filter(user=self.user, revoked_at__isnull=True).count(), 1)

    def test_logout_revokes_refresh_token_and_writes_audit_log(self):
        login_payload = self._login()
        refresh_token = login_payload['refresh_token']
        access_token = login_payload['token']

        response = self.client.post(
            '/api/auth/logout/',
            {'refresh_token': refresh_token},
            format='json',
            HTTP_AUTHORIZATION='Bearer ' + access_token,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        token_row = RefreshToken.objects.filter(user=self.user).latest('created_at')
        self.assertIsNotNone(token_row.revoked_at)

        self.assertTrue(
            AuditLog.objects.filter(
                actor=self.user,
                action='auth.logout',
                resource_type='user',
            ).exists()
        )

    @override_settings(DEBUG=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_signup_email_otp_verification_creates_user_and_returns_tokens(self):
        signup_email = 'new-signup@example.com'
        request_otp = self.client.post('/api/auth/signup/request-otp/', {
            'email': signup_email,
        }, format='json')
        self.assertEqual(request_otp.status_code, status.HTTP_200_OK)
        self.assertIn('otp', request_otp.data)

        verify = self.client.post('/api/auth/signup/verify-otp/', {
            'email': signup_email,
            'otp': request_otp.data['otp'],
            'username': 'otp-signup-user',
            'first_name': 'OTP',
            'last_name': 'Signup',
            'password': 'OtpSignupPass123!',
            'password_confirm': 'OtpSignupPass123!',
        }, format='json')
        self.assertEqual(verify.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', verify.data)
        self.assertIn('refresh_token', verify.data)

    @override_settings(DEBUG=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_signup_email_otp_invalid_code_rejected(self):
        signup_email = 'invalid-otp@example.com'
        request_otp = self.client.post('/api/auth/signup/request-otp/', {
            'email': signup_email,
        }, format='json')
        self.assertEqual(request_otp.status_code, status.HTTP_200_OK)

        verify = self.client.post('/api/auth/signup/verify-otp/', {
            'email': signup_email,
            'otp': '000000',
            'username': 'otp-invalid-user',
            'first_name': 'Invalid',
            'last_name': 'Code',
            'password': 'OtpSignupPass123!',
            'password_confirm': 'OtpSignupPass123!',
        }, format='json')
        self.assertEqual(verify.status_code, status.HTTP_401_UNAUTHORIZED)
        otp_row = SignupEmailOTP.objects.filter(email=signup_email).latest('created_at')
        self.assertEqual(otp_row.attempts, 1)
