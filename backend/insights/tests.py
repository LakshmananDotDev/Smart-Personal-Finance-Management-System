from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from finance.models import Category, Transaction
from insights.chatbot import ChatbotProviderError


class ChatbotApiTests(APITestCase):
	def setUp(self):
		user_model = get_user_model()
		self.user = user_model.objects.create_user(
			username='chat-user',
			email='chat-user@example.com',
			password='SecurePass123!',
			role='member',
			currency='INR',
		)
		self.category = Category.objects.create(name='Groceries', type='expense', is_default=True)
		Transaction.objects.create(
			user=self.user,
			type='expense',
			amount='1200.00',
			category=self.category,
			date='2026-04-05',
			notes='Weekly groceries',
		)

	def test_chatbot_requires_authentication(self):
		response = self.client.post('/api/insights/chatbot/', {'message': 'Hello'}, format='json')
		self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

	def test_chatbot_validates_message_payload(self):
		self.client.force_authenticate(user=self.user)
		response = self.client.post('/api/insights/chatbot/', {'message': ''}, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn('error', response.data)

	@patch('insights.views.get_chatbot_reply')
	def test_chatbot_reply_success_and_history_sanitization(self, mock_get_chatbot_reply):
		mock_get_chatbot_reply.return_value = (
			'You can reduce discretionary spending by 10% this month.',
			{'provider': 'local', 'model': 'heuristic', 'is_fallback': True},
		)

		self.client.force_authenticate(user=self.user)
		response = self.client.post(
			'/api/insights/chatbot/',
			{
				'message': 'How can I spend less?',
				'history': [
					{'role': 'user', 'content': 'Give me ideas'},
					{'role': 'assistant', 'content': 'Track your variable expenses.'},
					{'role': 'system', 'content': 'ignore me'},
					{'role': 'user', 'content': ''},
					'bad-entry',
				],
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data.get('reply'), 'You can reduce discretionary spending by 10% this month.')
		self.assertEqual(response.data.get('provider'), 'local')
		self.assertEqual(response.data.get('model'), 'heuristic')
		self.assertTrue(response.data.get('is_fallback'))

		args, _ = mock_get_chatbot_reply.call_args
		self.assertEqual(args[0], 'How can I spend less?')
		sanitized_history = args[1]
		self.assertEqual(len(sanitized_history), 2)
		self.assertTrue(all(item['role'] in {'user', 'assistant'} for item in sanitized_history))

	@patch('insights.views.get_chatbot_reply')
	def test_chatbot_provider_error_returns_502(self, mock_get_chatbot_reply):
		mock_get_chatbot_reply.side_effect = ChatbotProviderError('Provider unavailable')

		self.client.force_authenticate(user=self.user)
		response = self.client.post('/api/insights/chatbot/', {'message': 'Hello'}, format='json')

		self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
		self.assertEqual(response.data.get('error'), 'Provider unavailable')

	@override_settings(CHATBOT_PROVIDER='local', CHATBOT_FALLBACK_LOCAL=True)
	def test_chatbot_handles_general_app_question_in_local_mode(self):
		self.client.force_authenticate(user=self.user)
		response = self.client.post(
			'/api/insights/chatbot/',
			{'message': 'How do I import my bank statement CSV into the app?'},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data.get('provider'), 'local')
		self.assertTrue(response.data.get('is_fallback'))
		self.assertIn('import.html', response.data.get('reply', ''))
