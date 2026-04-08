import jwt
from django.conf import settings
from rest_framework import authentication, exceptions
from users.models import User
from users.token_service import issue_access_token


class JWTAuthentication(authentication.BaseAuthentication):
    keyword = 'Bearer'

    def authenticate_header(self, request):
        return self.keyword

    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith(self.keyword + ' '):
            return None

        token = auth_header[len(self.keyword) + 1:]
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('Token has expired')
        except jwt.InvalidTokenError:
            raise exceptions.AuthenticationFailed('Invalid token')

        token_type = payload.get('type', 'access')
        if token_type != 'access':
            raise exceptions.AuthenticationFailed('Invalid access token')

        try:
            user = User.objects.get(id=payload['user_id'])
        except User.DoesNotExist:
            raise exceptions.AuthenticationFailed('User not found')

        return (user, token)


def generate_token(user):
    # Backward-compatible alias used by existing call sites.
    return issue_access_token(user)
