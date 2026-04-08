import datetime
import hashlib
import secrets

import jwt
from django.conf import settings
from django.utils import timezone

from users.models import RefreshToken


def _utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


def _access_token_minutes():
    minutes = getattr(settings, 'JWT_ACCESS_TOKEN_MINUTES', None)
    if minutes is None:
        return int(getattr(settings, 'JWT_EXPIRATION_HOURS', 24)) * 60
    return int(minutes)


def _refresh_token_days():
    return int(getattr(settings, 'JWT_REFRESH_TOKEN_DAYS', 30))


def _hash_token(raw_token):
    return hashlib.sha256((raw_token or '').encode('utf-8')).hexdigest()


def issue_access_token(user):
    now = _utc_now()
    payload = {
        'user_id': user.id,
        'email': user.email,
        'type': 'access',
        'exp': now + datetime.timedelta(minutes=_access_token_minutes()),
        'iat': now,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm='HS256')


def issue_refresh_token(user, request=None):
    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_token(raw_token)

    ip_address = None
    if request:
        forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
        ip_address = forwarded_for.split(',')[0].strip() if forwarded_for else request.META.get('REMOTE_ADDR')

    RefreshToken.objects.create(
        user=user,
        token_hash=token_hash,
        expires_at=timezone.now() + datetime.timedelta(days=_refresh_token_days()),
        ip_address=ip_address,
        user_agent=((request.META.get('HTTP_USER_AGENT', '')[:255]) if request else ''),
    )

    return raw_token


def issue_auth_tokens(user, request=None):
    access_token = issue_access_token(user)
    refresh_token = issue_refresh_token(user, request=request)

    return {
        'token': access_token,
        'access_token': access_token,
        'refresh_token': refresh_token,
        'token_type': 'Bearer',
        'expires_in': _access_token_minutes() * 60,
    }


def rotate_refresh_token(raw_refresh_token, request=None):
    token_hash = _hash_token(raw_refresh_token)
    token_row = RefreshToken.objects.filter(token_hash=token_hash).select_related('user').first()

    if not token_row:
        return None
    if token_row.revoked_at is not None:
        return None
    if token_row.expires_at <= timezone.now():
        return None

    user = token_row.user
    new_tokens = issue_auth_tokens(user, request=request)
    token_row.revoked_at = timezone.now()
    token_row.replaced_by_hash = _hash_token(new_tokens['refresh_token'])
    token_row.save(update_fields=['revoked_at', 'replaced_by_hash'])

    return {
        'user': user,
        'tokens': new_tokens,
    }


def revoke_refresh_token(raw_refresh_token):
    token_hash = _hash_token(raw_refresh_token)
    token_row = RefreshToken.objects.filter(token_hash=token_hash).first()
    if not token_row:
        return False

    if token_row.revoked_at is None:
        token_row.revoked_at = timezone.now()
        token_row.save(update_fields=['revoked_at'])

    return True
