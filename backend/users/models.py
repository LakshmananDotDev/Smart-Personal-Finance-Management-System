from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    ROLE_CHOICES = [
        ('member', 'Member'),
        ('support', 'Support'),
        ('admin', 'Admin'),
    ]

    PLAN_CHOICES = [
        ('basic', 'Basic'),
        ('premium', 'Premium'),
    ]

    avatar = models.URLField(max_length=500, blank=True, default='')
    google_id = models.CharField(max_length=255, blank=True, default='', db_index=True)
    phone_number = models.CharField(max_length=20, null=True, blank=True, unique=True, db_index=True)
    currency = models.CharField(max_length=3, default='INR')
    dark_mode = models.BooleanField(default=False)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='member', db_index=True)
    is_onboarded = models.BooleanField(default=False)
    monthly_income = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    financial_goal = models.CharField(max_length=50, blank=True, default='')
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default='basic')
    premium_expires_at = models.DateTimeField(null=True, blank=True)
    razorpay_customer_id = models.CharField(max_length=120, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'users'

    def __str__(self):
        return self.email or self.username

    @property
    def is_premium_active(self):
        return self.plan == 'premium' and self.premium_expires_at and self.premium_expires_at >= timezone.now()


class RefreshToken(models.Model):
    user = models.ForeignKey(
        User, on_delete=models.CASCADE,
        related_name='refresh_tokens'
    )
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True, db_index=True)
    replaced_by_hash = models.CharField(max_length=64, blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'refresh_tokens'
        ordering = ['-created_at']

    def __str__(self):
        return f"RefreshToken(user={self.user_id})"


class LoginOTP(models.Model):
    PURPOSE_CHOICES = [
        ('login', 'Login'),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE,
        related_name='login_otps'
    )
    phone_number = models.CharField(max_length=20, db_index=True)
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default='login', db_index=True)
    otp_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'login_otps'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['phone_number', 'purpose', 'created_at']),
            models.Index(fields=['user', 'purpose', 'expires_at']),
        ]

    def __str__(self):
        return f"LoginOTP(user={self.user_id}, phone={self.phone_number})"


class SignupEmailOTP(models.Model):
    email = models.EmailField(db_index=True)
    otp_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'signup_email_otps'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email', 'created_at']),
            models.Index(fields=['email', 'expires_at']),
        ]

    def __str__(self):
        return f"SignupEmailOTP(email={self.email})"


class AuditLog(models.Model):
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='audit_logs'
    )
    action = models.CharField(max_length=120, db_index=True)
    resource_type = models.CharField(max_length=80, blank=True, default='')
    resource_id = models.CharField(max_length=80, blank=True, default='')
    metadata = models.JSONField(blank=True, default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['action', 'created_at']),
            models.Index(fields=['resource_type', 'resource_id', 'created_at']),
        ]

    def __str__(self):
        return f"AuditLog(action={self.action}, actor={self.actor_id})"
