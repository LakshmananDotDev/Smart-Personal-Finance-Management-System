from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
import re
from users.models import User
from users.entitlements import get_effective_plan, is_premium_active, get_premium_days_left


SUPPORTED_CURRENCIES = {'INR', 'USD', 'EUR', 'GBP'}
PHONE_REGEX = re.compile(r'^\+[1-9]\d{9,14}$')


def normalize_phone_number(value):
    raw = (value or '').strip()
    if not raw:
        return ''

    cleaned = re.sub(r'[\s\-()]+', '', raw)
    if cleaned.startswith('00'):
        cleaned = '+' + cleaned[2:]

    if cleaned.startswith('+'):
        normalized = '+' + re.sub(r'\D', '', cleaned[1:])
    else:
        digits = re.sub(r'\D', '', cleaned)
        if len(digits) == 10:
            normalized = '+91' + digits
        elif 11 <= len(digits) <= 15:
            normalized = '+' + digits
        else:
            raise serializers.ValidationError('Enter a valid phone number with country code.')

    if not PHONE_REGEX.match(normalized):
        raise serializers.ValidationError('Enter a valid phone number in international format (e.g. +919876543210).')

    return normalized


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'username', 'first_name', 'last_name', 'password', 'password_confirm']

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError('Email already registered.')
        return email

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
        )
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class PhoneOtpRequestSerializer(serializers.Serializer):
    phone_number = serializers.CharField()

    def validate_phone_number(self, value):
        return normalize_phone_number(value)


class PhoneOtpVerifySerializer(serializers.Serializer):
    phone_number = serializers.CharField()
    otp = serializers.CharField()

    def validate_phone_number(self, value):
        return normalize_phone_number(value)

    def validate_otp(self, value):
        otp = (value or '').strip()
        if not re.match(r'^\d{6}$', otp):
            raise serializers.ValidationError('OTP must be a 6-digit code.')
        return otp


class SignupEmailOtpRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError('Email already registered.')
        return email


class SignupEmailOtpVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField()

    def validate_email(self, value):
        return value.strip().lower()

    def validate_otp(self, value):
        otp = (value or '').strip()
        if not re.match(r'^\d{6}$', otp):
            raise serializers.ValidationError('OTP must be a 6-digit code.')
        return otp


class UserSerializer(serializers.ModelSerializer):
    has_password = serializers.SerializerMethodField()
    plan = serializers.SerializerMethodField()
    is_premium = serializers.SerializerMethodField()
    premium_days_left = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'first_name', 'last_name', 'phone_number', 'avatar',
                  'currency', 'dark_mode', 'role', 'is_superuser', 'is_onboarded', 'has_password',
                  'google_id', 'monthly_income', 'financial_goal', 'created_at',
                  'plan', 'is_premium', 'premium_expires_at', 'premium_days_left']
        read_only_fields = ['id', 'email', 'created_at', 'has_password', 'google_id',
                            'plan', 'is_premium', 'premium_expires_at', 'premium_days_left', 'role', 'is_superuser']

    def get_has_password(self, obj):
        return obj.has_usable_password()

    def get_plan(self, obj):
        return get_effective_plan(obj)

    def get_is_premium(self, obj):
        return is_premium_active(obj)

    def get_premium_days_left(self, obj):
        return get_premium_days_left(obj)


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'phone_number', 'currency', 'dark_mode', 'avatar',
                  'is_onboarded', 'monthly_income', 'financial_goal']

    def validate_phone_number(self, value):
        normalized = normalize_phone_number(value)
        if not normalized:
            return None

        qs = User.objects.filter(phone_number=normalized)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Phone number already in use.')
        return normalized

    def validate_currency(self, value):
        code = (value or '').upper().strip()
        if not code:
            return code
        if code not in SUPPORTED_CURRENCIES:
            raise serializers.ValidationError('Unsupported currency. Use INR, USD, EUR, or GBP.')
        return code


class AdminUserUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=['member', 'support', 'admin'], required=False)
    plan = serializers.ChoiceField(choices=['basic', 'premium'], required=False)
    premium_expires_at = serializers.DateTimeField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False)
    is_onboarded = serializers.BooleanField(required=False)

    def validate(self, attrs):
        plan = attrs.get('plan')
        has_expiry = 'premium_expires_at' in attrs

        if plan == 'basic' and has_expiry and attrs.get('premium_expires_at') is not None:
            raise serializers.ValidationError({'premium_expires_at': 'Basic plan cannot have premium expiry.'})

        if plan == 'basic' and not has_expiry:
            attrs['premium_expires_at'] = None

        return attrs
