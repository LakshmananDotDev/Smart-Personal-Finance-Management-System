import base64
import hashlib
import hmac
import json
import secrets
from datetime import timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.contrib.auth import authenticate
from django.utils import timezone
from decimal import Decimal, ROUND_HALF_UP
from users.models import User, LoginOTP, SignupEmailOTP, AuditLog
from users.entitlements import get_plan_offer, build_entitlements_payload
from users.serializers import (
    AdminUserUpdateSerializer,
    RegisterSerializer,
    LoginSerializer,
    PhoneOtpRequestSerializer,
    PhoneOtpVerifySerializer,
    SignupEmailOtpRequestSerializer,
    SignupEmailOtpVerifySerializer,
    UserSerializer,
    UserUpdateSerializer,
)
from users.token_service import issue_auth_tokens, rotate_refresh_token, revoke_refresh_token
from users.audit import log_audit_event
from common.api.permissions import IsAdminRole
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from finance.models import Account, Transaction, Budget, Subscription, SavingsGoal, GoalContribution


CURRENCY_INR_RATE = {
    'INR': Decimal('1.00'),
    'USD': Decimal('83.00'),
    'EUR': Decimal('90.00'),
    'GBP': Decimal('104.00'),
}
MONEY_PLACES = Decimal('0.01')
OTP_EXPIRY_SECONDS = getattr(settings, 'AUTH_OTP_EXPIRY_SECONDS', 300)
OTP_RESEND_COOLDOWN_SECONDS = getattr(settings, 'AUTH_OTP_RESEND_COOLDOWN_SECONDS', 45)
OTP_MAX_ATTEMPTS = getattr(settings, 'AUTH_OTP_MAX_ATTEMPTS', 5)
OTP_PROVIDER = (getattr(settings, 'AUTH_OTP_PROVIDER', 'console') or 'console').strip().lower()
SIGNUP_EMAIL_OTP_EXPIRY_SECONDS = getattr(settings, 'AUTH_SIGNUP_EMAIL_OTP_EXPIRY_SECONDS', 600)
SIGNUP_EMAIL_OTP_RESEND_COOLDOWN_SECONDS = getattr(settings, 'AUTH_SIGNUP_EMAIL_OTP_RESEND_COOLDOWN_SECONDS', 45)
SIGNUP_EMAIL_OTP_MAX_ATTEMPTS = getattr(settings, 'AUTH_SIGNUP_EMAIL_OTP_MAX_ATTEMPTS', 5)


def _hash_phone_otp(phone_number, otp_code):
    payload = f'{phone_number}:{otp_code}:{settings.SECRET_KEY}'
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def _generate_otp_code():
    return f'{secrets.randbelow(1000000):06d}'


def _hash_signup_email_otp(email, otp_code):
    payload = f'{email}:{otp_code}:{settings.SECRET_KEY}'
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def _send_signup_email_otp(email, otp_code):
    minutes = max(1, int((SIGNUP_EMAIL_OTP_EXPIRY_SECONDS + 59) // 60))
    subject = 'Finyx signup verification code'
    body = (
        f'Your Finyx signup verification code is {otp_code}.\n\n'
        f'This code is valid for {minutes} minutes.\n'
        'If you did not request this, you can ignore this email.'
    )

    sent = send_mail(
        subject,
        body,
        getattr(settings, 'DEFAULT_FROM_EMAIL', '') or 'no-reply@finyx.local',
        [email],
        fail_silently=False,
    )
    if not sent:
        raise ValueError('Could not send verification email. Please try again.')


def _otp_message_text(otp_code):
    minutes = max(1, int((OTP_EXPIRY_SECONDS + 59) // 60))
    return f'Your Finyx OTP is {otp_code}. It is valid for {minutes} minutes. Do not share this code.'


def _send_twilio_otp(phone_number, otp_code):
    account_sid = (getattr(settings, 'TWILIO_ACCOUNT_SID', '') or '').strip()
    auth_token = (getattr(settings, 'TWILIO_AUTH_TOKEN', '') or '').strip()
    from_number = (getattr(settings, 'TWILIO_FROM_NUMBER', '') or '').strip()

    if not account_sid or not auth_token or not from_number:
        raise ValueError('Twilio OTP provider is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.')

    payload = {
        'To': phone_number,
        'From': from_number,
        'Body': _otp_message_text(otp_code),
    }
    request_data = urlencode(payload).encode('utf-8')
    auth_value = base64.b64encode(f'{account_sid}:{auth_token}'.encode('utf-8')).decode('ascii')

    req = Request(
        url=f'https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json',
        data=request_data,
        headers={
            'Authorization': 'Basic ' + auth_value,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        },
        method='POST',
    )

    try:
        with urlopen(req, timeout=20) as response:
            body = response.read().decode('utf-8')
            parsed = json.loads(body) if body else {}
            if not parsed.get('sid'):
                raise ValueError('Twilio did not accept the OTP message.')
            return {'provider': 'twilio'}
    except HTTPError as exc:
        raw = ''
        try:
            raw = exc.read().decode('utf-8')
        except Exception:
            raw = ''

        message = 'Failed to deliver OTP via Twilio.'
        if raw:
            try:
                parsed = json.loads(raw)
                message = parsed.get('message') or parsed.get('detail') or message
            except (TypeError, ValueError):
                message = raw[:300]
        raise ValueError(message)
    except URLError:
        raise ValueError('Could not connect to Twilio for OTP delivery.')


def _send_fast2sms_otp(phone_number, otp_code):
    api_key = (getattr(settings, 'FAST2SMS_API_KEY', '') or '').strip()
    route = (getattr(settings, 'FAST2SMS_ROUTE', 'q') or 'q').strip()
    sender_id = (getattr(settings, 'FAST2SMS_SENDER_ID', '') or '').strip()

    if not api_key:
        raise ValueError('Fast2SMS OTP provider is not configured. Set FAST2SMS_API_KEY.')

    digits = ''.join(ch for ch in phone_number if ch.isdigit())
    payload = {
        'route': route,
        'message': _otp_message_text(otp_code),
        'language': 'english',
        'numbers': digits,
        'flash': '0',
    }
    if sender_id:
        payload['sender_id'] = sender_id

    req = Request(
        url='https://www.fast2sms.com/dev/bulkV2',
        data=urlencode(payload).encode('utf-8'),
        headers={
            'authorization': api_key,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        },
        method='POST',
    )

    try:
        with urlopen(req, timeout=20) as response:
            body = response.read().decode('utf-8')
            parsed = json.loads(body) if body else {}
            delivered = bool(parsed.get('return')) or str(parsed.get('status_code', '')) == '200'
            if not delivered:
                raise ValueError(parsed.get('message') or 'Fast2SMS did not accept the OTP message.')
            return {'provider': 'fast2sms'}
    except HTTPError as exc:
        raw = ''
        try:
            raw = exc.read().decode('utf-8')
        except Exception:
            raw = ''

        message = 'Failed to deliver OTP via Fast2SMS.'
        if raw:
            try:
                parsed = json.loads(raw)
                message = parsed.get('message') or parsed.get('error') or message
            except (TypeError, ValueError):
                message = raw[:300]
        raise ValueError(message)
    except URLError:
        raise ValueError('Could not connect to Fast2SMS for OTP delivery.')


def _send_login_otp(phone_number, otp_code):
    if OTP_PROVIDER in {'console', 'debug', 'none'}:
        return {'provider': 'console'}
    if OTP_PROVIDER == 'twilio':
        return _send_twilio_otp(phone_number, otp_code)
    if OTP_PROVIDER == 'fast2sms':
        return _send_fast2sms_otp(phone_number, otp_code)
    raise ValueError('Unsupported AUTH_OTP_PROVIDER. Use console, twilio, or fast2sms.')


def _currency_conversion_factor(old_currency, new_currency):
    old_code = (old_currency or 'INR').upper()
    new_code = (new_currency or 'INR').upper()

    old_rate = CURRENCY_INR_RATE.get(old_code)
    new_rate = CURRENCY_INR_RATE.get(new_code)
    if old_rate is None or new_rate is None:
        return None

    return (old_rate / new_rate).quantize(Decimal('0.0000001'), rounding=ROUND_HALF_UP)


def _convert_money(value, factor):
    return (Decimal(value) * factor).quantize(MONEY_PLACES, rounding=ROUND_HALF_UP)


def _convert_user_amounts(user, factor):
    if factor is None or factor == Decimal('1'):
        return

    for account in Account.objects.filter(user=user):
        account.balance = _convert_money(account.balance, factor)
        account.save(update_fields=['balance'])

    for tx in Transaction.objects.filter(user=user):
        tx.amount = _convert_money(tx.amount, factor)
        tx.save(update_fields=['amount'])

    for budget in Budget.objects.filter(user=user):
        budget.amount = _convert_money(budget.amount, factor)
        budget.save(update_fields=['amount'])

    for sub in Subscription.objects.filter(user=user):
        sub.amount = _convert_money(sub.amount, factor)
        sub.save(update_fields=['amount'])

    for goal in SavingsGoal.objects.filter(user=user):
        goal.target_amount = _convert_money(goal.target_amount, factor)
        goal.current_amount = _convert_money(goal.current_amount, factor)
        goal.save(update_fields=['target_amount', 'current_amount'])

    for contribution in GoalContribution.objects.filter(goal__user=user):
        contribution.amount = _convert_money(contribution.amount, factor)
        contribution.save(update_fields=['amount'])

    if user.monthly_income is not None:
        user.monthly_income = _convert_money(user.monthly_income, factor)
        user.save(update_fields=['monthly_income'])


def _get_razorpay_credentials():
    key_id = (getattr(settings, 'RAZORPAY_KEY_ID', '') or '').strip()
    key_secret = (getattr(settings, 'RAZORPAY_KEY_SECRET', '') or '').strip()
    return key_id, key_secret


def _razorpay_request(method, path, payload=None):
    key_id, key_secret = _get_razorpay_credentials()
    if not key_id or not key_secret:
        raise ValueError('Razorpay is not configured on this server.')

    auth_token = base64.b64encode(f'{key_id}:{key_secret}'.encode('utf-8')).decode('ascii')
    headers = {
        'Authorization': 'Basic ' + auth_token,
        'Accept': 'application/json',
    }

    request_data = None
    if payload is not None:
        request_data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    req = Request(
        url='https://api.razorpay.com' + path,
        data=request_data,
        headers=headers,
        method=method.upper(),
    )

    try:
        with urlopen(req, timeout=20) as response:
            body = response.read().decode('utf-8')
            return json.loads(body) if body else {}
    except HTTPError as exc:
        message = 'Razorpay request failed.'
        raw = ''
        try:
            raw = exc.read().decode('utf-8')
        except Exception:
            raw = ''

        if raw:
            try:
                parsed = json.loads(raw)
                err = parsed.get('error') if isinstance(parsed, dict) else None
                if isinstance(err, dict):
                    message = err.get('description') or err.get('reason') or message
                elif isinstance(parsed, dict):
                    message = parsed.get('description') or message
            except (TypeError, ValueError):
                message = raw[:300]

        raise ValueError(message)
    except URLError:
        raise ValueError('Could not connect to Razorpay. Please try again.')


def _activate_premium_access(user, duration_days):
    now = timezone.now()
    start_at = now
    if user.premium_expires_at and user.premium_expires_at > now:
        start_at = user.premium_expires_at

    user.plan = 'premium'
    user.premium_expires_at = start_at + timedelta(days=duration_days)
    user.save(update_fields=['plan', 'premium_expires_at', 'updated_at'])
    return user.premium_expires_at


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        tokens = issue_auth_tokens(user, request=request)
        log_audit_event(
            user=user,
            action='auth.register',
            resource_type='user',
            resource_id=user.id,
            metadata={'method': 'password'},
            request=request,
        )
        return Response({
            **tokens,
            'user': UserSerializer(user).data,
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def request_signup_email_otp(request):
    serializer = SignupEmailOtpRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data['email']
    now = timezone.now()

    active_recent = SignupEmailOTP.objects.filter(
        email=email,
        consumed_at__isnull=True,
        expires_at__gte=now,
    ).order_by('-created_at').first()

    if active_recent:
        elapsed = (now - active_recent.created_at).total_seconds()
        if elapsed < SIGNUP_EMAIL_OTP_RESEND_COOLDOWN_SECONDS:
            wait_seconds = max(1, int(SIGNUP_EMAIL_OTP_RESEND_COOLDOWN_SECONDS - elapsed))
            return Response(
                {'error': f'Please wait {wait_seconds} seconds before requesting another code.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

    otp_code = _generate_otp_code()
    expires_at = now + timedelta(seconds=SIGNUP_EMAIL_OTP_EXPIRY_SECONDS)

    otp_row = SignupEmailOTP.objects.create(
        email=email,
        otp_hash=_hash_signup_email_otp(email, otp_code),
        expires_at=expires_at,
    )

    try:
        _send_signup_email_otp(email, otp_code)
    except Exception as exc:
        otp_row.delete()
        return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    SignupEmailOTP.objects.filter(
        email=email,
        consumed_at__isnull=True,
    ).exclude(pk=otp_row.pk).update(consumed_at=now)

    log_audit_event(
        user=None,
        action='auth.signup_otp_requested',
        resource_type='user',
        metadata={'email': email},
        request=request,
    )

    payload = {
        'message': 'Verification code sent to your email.',
        'expires_in': SIGNUP_EMAIL_OTP_EXPIRY_SECONDS,
    }
    if getattr(settings, 'DEBUG', False):
        payload['otp'] = otp_code

    return Response(payload)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_signup_email_otp(request):
    otp_serializer = SignupEmailOtpVerifySerializer(data=request.data)
    if not otp_serializer.is_valid():
        return Response(otp_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = otp_serializer.validated_data['email']
    otp_code = otp_serializer.validated_data['otp']
    now = timezone.now()

    otp_row = SignupEmailOTP.objects.filter(
        email=email,
        consumed_at__isnull=True,
    ).order_by('-created_at').first()

    if not otp_row or otp_row.expires_at < now:
        return Response({'error': 'Verification code expired or invalid. Request a new one.'}, status=status.HTTP_401_UNAUTHORIZED)

    if otp_row.attempts >= SIGNUP_EMAIL_OTP_MAX_ATTEMPTS:
        if otp_row.consumed_at is None:
            otp_row.consumed_at = now
            otp_row.save(update_fields=['consumed_at'])
        return Response({'error': 'Too many invalid attempts. Request a new code.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    expected_hash = _hash_signup_email_otp(email, otp_code)
    if not hmac.compare_digest(expected_hash, otp_row.otp_hash):
        otp_row.attempts += 1
        fields = ['attempts']
        if otp_row.attempts >= SIGNUP_EMAIL_OTP_MAX_ATTEMPTS:
            otp_row.consumed_at = now
            fields.append('consumed_at')
        otp_row.save(update_fields=fields)
        return Response({'error': 'Invalid verification code.'}, status=status.HTTP_401_UNAUTHORIZED)

    reg_serializer = RegisterSerializer(data=request.data)
    if not reg_serializer.is_valid():
        return Response(reg_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    if reg_serializer.validated_data.get('email') != email:
        return Response({'error': 'Email mismatch for verification.'}, status=status.HTTP_400_BAD_REQUEST)

    user = reg_serializer.save()
    otp_row.consumed_at = now
    otp_row.save(update_fields=['consumed_at'])

    tokens = issue_auth_tokens(user, request=request)
    log_audit_event(
        user=user,
        action='auth.register',
        resource_type='user',
        resource_id=user.id,
        metadata={'method': 'email_otp'},
        request=request,
    )

    return Response({
        **tokens,
        'user': UserSerializer(user).data,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    serializer = LoginSerializer(data=request.data)
    if serializer.is_valid():
        email = serializer.validated_data['email'].strip()
        password = serializer.validated_data['password']

        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            return Response(
                {'error': 'Invalid credentials.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        user = authenticate(username=user.username, password=password)
        if user is None:
            return Response(
                {'error': 'Invalid credentials.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        tokens = issue_auth_tokens(user, request=request)
        log_audit_event(
            user=user,
            action='auth.login',
            resource_type='user',
            resource_id=user.id,
            metadata={'method': 'password'},
            request=request,
        )
        return Response({
            **tokens,
            'user': UserSerializer(user).data,
        })
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def admin_login(request):
    serializer = LoginSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data['email'].strip()
    password = serializer.validated_data['password']

    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

    user = authenticate(username=user.username, password=password)
    if user is None:
        return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

    if getattr(user, 'role', 'member') != 'admin' and not getattr(user, 'is_superuser', False):
        return Response({'error': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    tokens = issue_auth_tokens(user, request=request)
    log_audit_event(
        user=user,
        action='auth.admin_login',
        resource_type='user',
        resource_id=user.id,
        metadata={'method': 'password'},
        request=request,
    )
    return Response({
        **tokens,
        'user': UserSerializer(user).data,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def request_login_otp(request):
    serializer = PhoneOtpRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    phone_number = serializer.validated_data['phone_number']
    user = User.objects.filter(phone_number=phone_number).first()
    if not user:
        return Response({'error': 'No account found for this phone number.'}, status=status.HTTP_404_NOT_FOUND)

    now = timezone.now()

    active_recent = LoginOTP.objects.filter(
        user=user,
        phone_number=phone_number,
        purpose='login',
        consumed_at__isnull=True,
        expires_at__gte=now,
    ).order_by('-created_at').first()

    if active_recent:
        elapsed = (now - active_recent.created_at).total_seconds()
        if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
            wait_seconds = max(1, int(OTP_RESEND_COOLDOWN_SECONDS - elapsed))
            return Response(
                {'error': f'Please wait {wait_seconds} seconds before requesting another OTP.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

    otp_code = _generate_otp_code()
    expires_at = now + timedelta(seconds=OTP_EXPIRY_SECONDS)

    otp_row = LoginOTP.objects.create(
        user=user,
        phone_number=phone_number,
        purpose='login',
        otp_hash=_hash_phone_otp(phone_number, otp_code),
        expires_at=expires_at,
    )

    try:
        delivery = _send_login_otp(phone_number, otp_code)
    except ValueError as exc:
        otp_row.delete()
        return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    LoginOTP.objects.filter(
        user=user,
        phone_number=phone_number,
        purpose='login',
        consumed_at__isnull=True,
    ).exclude(pk=otp_row.pk).update(consumed_at=now)

    log_audit_event(
        user=user,
        action='auth.otp_requested',
        resource_type='user',
        resource_id=user.id,
        metadata={'method': 'phone_otp'},
        request=request,
    )

    payload = {
        'message': 'OTP sent successfully.',
        'expires_in': OTP_EXPIRY_SECONDS,
        'delivery': delivery.get('provider', 'console'),
    }
    if getattr(settings, 'DEBUG', False):
        payload['otp'] = otp_code

    return Response(payload)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_login_otp(request):
    serializer = PhoneOtpVerifySerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    phone_number = serializer.validated_data['phone_number']
    otp_code = serializer.validated_data['otp']

    user = User.objects.filter(phone_number=phone_number).first()
    if not user:
        return Response({'error': 'Invalid phone number or OTP.'}, status=status.HTTP_401_UNAUTHORIZED)

    now = timezone.now()
    otp_row = LoginOTP.objects.filter(
        user=user,
        phone_number=phone_number,
        purpose='login',
        consumed_at__isnull=True,
    ).order_by('-created_at').first()

    if not otp_row or otp_row.expires_at < now:
        return Response({'error': 'OTP expired or invalid. Request a new one.'}, status=status.HTTP_401_UNAUTHORIZED)

    if otp_row.attempts >= OTP_MAX_ATTEMPTS:
        if otp_row.consumed_at is None:
            otp_row.consumed_at = now
            otp_row.save(update_fields=['consumed_at'])
        return Response({'error': 'Too many invalid attempts. Request a new OTP.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    expected_hash = _hash_phone_otp(phone_number, otp_code)
    if not hmac.compare_digest(expected_hash, otp_row.otp_hash):
        otp_row.attempts += 1
        fields = ['attempts']
        if otp_row.attempts >= OTP_MAX_ATTEMPTS:
            otp_row.consumed_at = now
            fields.append('consumed_at')
        otp_row.save(update_fields=fields)
        return Response({'error': 'Invalid phone number or OTP.'}, status=status.HTTP_401_UNAUTHORIZED)

    otp_row.consumed_at = now
    otp_row.save(update_fields=['consumed_at'])

    tokens = issue_auth_tokens(user, request=request)
    log_audit_event(
        user=user,
        action='auth.login',
        resource_type='user',
        resource_id=user.id,
        metadata={'method': 'phone_otp'},
        request=request,
    )

    return Response({
        **tokens,
        'user': UserSerializer(user).data,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def google_login(request):
    google_token = request.data.get('token')
    if not google_token:
        return Response(
            {'error': 'Google token required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    expected_client_id = getattr(settings, 'GOOGLE_CLIENT_ID', '')
    if not expected_client_id:
        return Response(
            {'error': 'Google login is not configured on this server.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    try:
        google_data = google_id_token.verify_oauth2_token(
            google_token, google_requests.Request(), expected_client_id
        )
    except ValueError as e:
        return Response(
            {'error': f'Invalid Google token: {e}'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    email = google_data.get('email')
    google_id = google_data.get('sub')

    if not email or not google_id:
        return Response(
            {'error': 'Could not retrieve Google account info.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            'username': email.split('@')[0],
            'first_name': google_data.get('given_name', ''),
            'last_name': google_data.get('family_name', ''),
            'google_id': google_id,
            'avatar': google_data.get('picture', ''),
        }
    )

    if not created and not user.google_id:
        user.google_id = google_id
        user.avatar = google_data.get('picture', user.avatar)
        user.save(update_fields=['google_id', 'avatar'])

    tokens = issue_auth_tokens(user, request=request)
    log_audit_event(
        user=user,
        action='auth.login',
        resource_type='user',
        resource_id=user.id,
        metadata={'method': 'google', 'created': created},
        request=request,
    )
    return Response({
        **tokens,
        'user': UserSerializer(user).data,
        'created': created,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def entitlements(request):
    return Response(build_entitlements_payload(request.user))


@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_access_token(request):
    raw_refresh_token = (request.data.get('refresh_token') or '').strip()
    if not raw_refresh_token:
        return Response({'error': 'refresh_token is required.'}, status=status.HTTP_400_BAD_REQUEST)

    rotated = rotate_refresh_token(raw_refresh_token, request=request)
    if not rotated:
        return Response({'error': 'Invalid or expired refresh token.'}, status=status.HTTP_401_UNAUTHORIZED)

    user = rotated['user']
    log_audit_event(
        user=user,
        action='auth.token_refreshed',
        resource_type='user',
        resource_id=user.id,
        request=request,
    )

    return Response({
        **rotated['tokens'],
        'user': UserSerializer(user).data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    raw_refresh_token = (request.data.get('refresh_token') or '').strip()
    if raw_refresh_token:
        revoke_refresh_token(raw_refresh_token)

    log_audit_event(
        user=request.user,
        action='auth.logout',
        resource_type='user',
        resource_id=request.user.id,
        request=request,
    )
    return Response({'message': 'Logged out.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def premium_create_order(request):
    plan_code = (request.data.get('plan') or 'monthly').strip().lower()
    offer = get_plan_offer(plan_code)
    if not offer:
        return Response(
            {'error': 'Invalid plan. Use monthly or yearly.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    key_id, key_secret = _get_razorpay_credentials()
    if not key_id or not key_secret:
        return Response(
            {'error': 'Payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    payload = {
        'amount': offer['amount_paise'],
        'currency': 'INR',
        'receipt': f'premium-{request.user.id}-{timezone.now().strftime("%Y%m%d%H%M%S")}',
        'notes': {
            'user_id': str(request.user.id),
            'email': request.user.email or '',
            'plan': plan_code,
        },
    }

    try:
        order = _razorpay_request('POST', '/v1/orders', payload)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    if not order.get('id'):
        return Response(
            {'error': 'Unable to create payment order right now. Please try again.'},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response({
        'order_id': order.get('id'),
        'amount': order.get('amount'),
        'currency': order.get('currency', 'INR'),
        'plan': plan_code,
        'plan_label': offer['label'],
        'amount_inr': offer['amount_inr'],
        'description': offer['description'],
        'key_id': key_id,
        'entitlements': build_entitlements_payload(request.user),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def premium_verify_payment(request):
    plan_code = (request.data.get('plan') or '').strip().lower()
    offer = get_plan_offer(plan_code)
    if not offer:
        return Response(
            {'error': 'Invalid plan. Use monthly or yearly.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    order_id = (request.data.get('razorpay_order_id') or '').strip()
    payment_id = (request.data.get('razorpay_payment_id') or '').strip()
    signature = (request.data.get('razorpay_signature') or '').strip()

    if not order_id or not payment_id or not signature:
        return Response(
            {'error': 'Missing payment verification fields.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    _, key_secret = _get_razorpay_credentials()
    if not key_secret:
        return Response(
            {'error': 'Payments are not configured on this server.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    signing_payload = f'{order_id}|{payment_id}'
    expected_signature = hmac.new(
        key_secret.encode('utf-8'),
        signing_payload.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, signature):
        return Response(
            {'error': 'Invalid payment signature.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        payment = _razorpay_request('GET', f'/v1/payments/{payment_id}')
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    if (payment.get('order_id') or '') != order_id:
        return Response(
            {'error': 'Payment order mismatch.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    payment_status = (payment.get('status') or '').lower()
    if payment_status not in {'captured', 'authorized'}:
        return Response(
            {'error': 'Payment is not completed yet.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    paid_amount = int(payment.get('amount') or 0)
    if paid_amount < offer['amount_paise']:
        return Response(
            {'error': 'Payment amount mismatch.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    expires_at = _activate_premium_access(request.user, offer['duration_days'])
    log_audit_event(
        user=request.user,
        action='billing.premium_activated',
        resource_type='user',
        resource_id=request.user.id,
        metadata={
            'plan': plan_code,
            'payment_id': payment_id,
            'order_id': order_id,
            'amount_paise': paid_amount,
        },
        request=request,
    )

    return Response({
        'message': f'Premium activated successfully ({offer["label"]}).',
        'premium_expires_at': expires_at,
        'user': UserSerializer(request.user).data,
        'entitlements': build_entitlements_payload(request.user),
    })


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def profile(request):
    if request.method == 'GET':
        return Response(UserSerializer(request.user).data)

    serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        old_currency = request.user.currency
        new_currency = serializer.validated_data.get('currency', old_currency)

        with transaction.atomic():
            serializer.save()

            if (new_currency or '').upper() != (old_currency or '').upper():
                factor = _currency_conversion_factor(old_currency, new_currency)
                _convert_user_amounts(request.user, factor)

        log_audit_event(
            user=request.user,
            action='user.profile_updated',
            resource_type='user',
            resource_id=request.user.id,
            metadata={'currency_changed': (old_currency or '').upper() != (new_currency or '').upper()},
            request=request,
        )

        return Response(UserSerializer(request.user).data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    user = request.user
    current = request.data.get('current_password', '')
    new_pw = request.data.get('new_password', '')

    if not current or not new_pw:
        return Response({'error': 'Both current and new password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if not user.check_password(current):
        return Response({'error': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

    if len(new_pw) < 6:
        return Response({'error': 'New password must be at least 6 characters.'}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_pw)
    user.save()
    log_audit_event(
        user=user,
        action='auth.password_changed',
        resource_type='user',
        resource_id=user.id,
        request=request,
    )
    return Response({'message': 'Password changed successfully.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def set_password(request):
    """Allow OAuth users (no password) to set an initial password."""
    user = request.user
    if user.has_usable_password():
        return Response(
            {'error': 'Password is already set. Use change-password instead.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    new_pw = request.data.get('new_password', '')
    if len(new_pw) < 6:
        return Response(
            {'error': 'Password must be at least 6 characters.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user.set_password(new_pw)
    user.save()
    log_audit_event(
        user=user,
        action='auth.password_set',
        resource_type='user',
        resource_id=user.id,
        request=request,
    )
    return Response({'message': 'Password set successfully.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminRole])
def admin_overview(request):
    now = timezone.now()
    this_month_start = now.date().replace(day=1)
    last_30_days = now - timedelta(days=30)

    user_qs = User.objects.all()
    total_users = user_qs.count()
    members_count = user_qs.filter(role='member').count()
    support_count = user_qs.filter(role='support').count()
    admin_count = user_qs.filter(role='admin').count()
    new_users_30d = user_qs.filter(created_at__gte=last_30_days).count()
    premium_users = user_qs.filter(plan='premium').count()

    total_transactions = Transaction.objects.count()
    monthly_transactions = Transaction.objects.filter(date__gte=this_month_start).count()
    active_subscriptions = Subscription.objects.filter(is_active=True).count()
    budget_count = Budget.objects.count()
    goals_count = SavingsGoal.objects.count()
    recent_audit_events = AuditLog.objects.filter(created_at__gte=now - timedelta(hours=24)).count()

    recurring = Subscription.objects.filter(is_active=True).aggregate(
        monthly=Sum('amount', filter=Q(frequency='monthly')),
        yearly=Sum('amount', filter=Q(frequency='yearly')),
        weekly=Sum('amount', filter=Q(frequency='weekly')),
    )
    monthly_value = Decimal(recurring.get('monthly') or 0)
    yearly_value = Decimal(recurring.get('yearly') or 0)
    weekly_value = Decimal(recurring.get('weekly') or 0)
    estimated_mrr = (monthly_value + (yearly_value / Decimal('12')) + (weekly_value * Decimal('4.345'))).quantize(
        MONEY_PLACES,
        rounding=ROUND_HALF_UP,
    )

    top_expense_categories = list(
        Transaction.objects.filter(type='expense')
        .values('category__name')
        .annotate(total_spend=Sum('amount'), transaction_count=Count('id'))
        .order_by('-total_spend')[:5]
    )
    for row in top_expense_categories:
        row['category'] = row.pop('category__name') or 'Uncategorized'

    return Response({
        'users': {
            'total': total_users,
            'new_last_30_days': new_users_30d,
            'premium': premium_users,
            'members': members_count,
            'support': support_count,
            'admins': admin_count,
        },
        'finance': {
            'transactions_total': total_transactions,
            'transactions_this_month': monthly_transactions,
            'active_subscriptions': active_subscriptions,
            'estimated_mrr': estimated_mrr,
            'budgets_total': budget_count,
            'goals_total': goals_count,
        },
        'activity': {
            'audit_events_last_24h': recent_audit_events,
            'top_expense_categories': top_expense_categories,
        },
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminRole])
def admin_users(request):
    query = (request.query_params.get('q') or '').strip()
    role = (request.query_params.get('role') or '').strip().lower()
    plan = (request.query_params.get('plan') or '').strip().lower()

    try:
        page = max(1, int(request.query_params.get('page', 1)))
    except (TypeError, ValueError):
        page = 1

    try:
        page_size = int(request.query_params.get('page_size', 20))
    except (TypeError, ValueError):
        page_size = 20
    page_size = max(1, min(page_size, 100))

    qs = User.objects.all().order_by('-created_at')
    if query:
        qs = qs.filter(
            Q(email__icontains=query)
            | Q(username__icontains=query)
            | Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
        )
    if role in {'member', 'support', 'admin'}:
        qs = qs.filter(role=role)
    if plan in {'basic', 'premium'}:
        qs = qs.filter(plan=plan)

    total = qs.count()
    start = (page - 1) * page_size
    end = start + page_size
    users_page = list(qs[start:end])

    user_ids = [u.id for u in users_page]
    tx_counts = {
        row['user_id']: row['count']
        for row in Transaction.objects.filter(user_id__in=user_ids)
        .values('user_id')
        .annotate(count=Count('id'))
    }
    sub_counts = {
        row['user_id']: row['count']
        for row in Subscription.objects.filter(user_id__in=user_ids)
        .values('user_id')
        .annotate(count=Count('id'))
    }

    payload = UserSerializer(users_page, many=True).data
    for row in payload:
        uid = row['id']
        row['transaction_count'] = tx_counts.get(uid, 0)
        row['subscription_count'] = sub_counts.get(uid, 0)

    return Response({
        'count': total,
        'page': page,
        'page_size': page_size,
        'results': payload,
    })


@api_view(['PATCH'])
@permission_classes([IsAuthenticated, IsAdminRole])
def admin_user_update(request, user_id):
    target = User.objects.filter(id=user_id).first()
    if not target:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    serializer = AdminUserUpdateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    updates = dict(serializer.validated_data)
    if not updates:
        return Response({'error': 'No valid fields provided.'}, status=status.HTTP_400_BAD_REQUEST)

    if target.id == request.user.id and 'role' in updates and updates['role'] != 'admin':
        return Response({'error': 'You cannot remove your own admin role.'}, status=status.HTTP_400_BAD_REQUEST)

    if updates.get('plan') == 'premium' and 'premium_expires_at' not in updates and not target.premium_expires_at:
        updates['premium_expires_at'] = timezone.now() + timedelta(days=30)

    for field, value in updates.items():
        setattr(target, field, value)
    target.save()

    serializable_changes = {}
    for field, value in updates.items():
        if hasattr(value, 'isoformat'):
            serializable_changes[field] = value.isoformat()
        else:
            serializable_changes[field] = value

    log_audit_event(
        user=request.user,
        action='admin.user_updated',
        resource_type='user',
        resource_id=target.id,
        metadata={'changes': serializable_changes},
        request=request,
    )

    return Response({
        'message': 'User updated successfully.',
        'user': UserSerializer(target).data,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminRole])
def admin_audit_logs(request):
    action_filter = (request.query_params.get('action') or '').strip()

    try:
        limit = int(request.query_params.get('limit', 40))
    except (TypeError, ValueError):
        limit = 40
    limit = max(1, min(limit, 200))

    logs_qs = AuditLog.objects.select_related('actor').order_by('-created_at')
    if action_filter:
        logs_qs = logs_qs.filter(action__icontains=action_filter)

    logs = logs_qs[:limit]
    results = []
    for log in logs:
        actor = log.actor
        results.append({
            'id': log.id,
            'action': log.action,
            'resource_type': log.resource_type,
            'resource_id': log.resource_id,
            'metadata': log.metadata,
            'actor_id': actor.id if actor else None,
            'actor_email': actor.email if actor else '',
            'created_at': log.created_at,
        })

    return Response({'count': len(results), 'results': results})
