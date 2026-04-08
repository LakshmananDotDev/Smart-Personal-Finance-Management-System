import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-dev-key-change-in-production')

DEBUG = os.environ.get('DJANGO_DEBUG', 'True') == 'True'

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'users',
    'finance',
    'insights',
    'tax',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'smartfinance.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'smartfinance.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.environ.get('DB_NAME', 'nextgen_smart_finance_manager'),
        'USER': os.environ.get('DB_USER', 'root'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', '127.0.0.1'),
        'PORT': os.environ.get('DB_PORT', '3306'),
        'OPTIONS': {
            'charset': 'utf8mb4',
        },
    }
}

AUTH_USER_MODEL = 'users.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'users.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'common.api.pagination.StandardResultsSetPagination',
    'PAGE_SIZE': 20,
    'EXCEPTION_HANDLER': 'common.api.exception_handler.api_exception_handler',
}

CORS_ALLOWED_ORIGINS = [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]
CORS_ALLOWED_ORIGIN_REGEXES = [
    r'^https?://localhost(:\d+)?$',
    r'^https?://127\.0\.0\.1(:\d+)?$',
    r'^https?://192\.168\.\d+\.\d+(:\d+)?$',
    r'^https?://10\.\d+\.\d+\.\d+(:\d+)?$',
]

# In local development, allow all origins so any browser launch path works
# (localhost, local IP, or file-opened pages that send Origin: null).
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True

CORS_ALLOW_CREDENTIALS = True

JWT_SECRET = os.environ.get('JWT_SECRET', SECRET_KEY)
JWT_EXPIRATION_HOURS = int(os.environ.get('JWT_EXPIRATION_HOURS', '24'))
JWT_ACCESS_TOKEN_MINUTES = int(os.environ.get('JWT_ACCESS_TOKEN_MINUTES', '15'))
JWT_REFRESH_TOKEN_DAYS = int(os.environ.get('JWT_REFRESH_TOKEN_DAYS', '30'))

REDIS_URL = os.environ.get('REDIS_URL', 'redis://127.0.0.1:6379/1')

try:
    import django_redis  # noqa: F401
    CACHE_BACKEND = 'django_redis.cache.RedisCache'
    CACHE_LOCATION = REDIS_URL
    CACHE_OPTIONS = {
        'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        'IGNORE_EXCEPTIONS': True,
    }
except ImportError:
    CACHE_BACKEND = 'django.core.cache.backends.locmem.LocMemCache'
    CACHE_LOCATION = 'default'
    CACHE_OPTIONS = {}

CACHES = {
    'default': {
        'BACKEND': CACHE_BACKEND,
        'LOCATION': CACHE_LOCATION,
        'OPTIONS': CACHE_OPTIONS,
        'KEY_PREFIX': 'sfm',
        'TIMEOUT': int(os.environ.get('DEFAULT_CACHE_TIMEOUT', '300')),
    }
}

CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://127.0.0.1:6379/2')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://127.0.0.1:6379/3')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = os.environ.get('CELERY_TIMEZONE', 'UTC')
CELERY_TASK_SOFT_TIME_LIMIT = int(os.environ.get('CELERY_TASK_SOFT_TIME_LIMIT', '25'))
CELERY_TASK_TIME_LIMIT = int(os.environ.get('CELERY_TASK_TIME_LIMIT', '30'))

GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')

RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID', '')
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET', '')

PREMIUM_MONTHLY_PRICE_INR = int(os.environ.get('PREMIUM_MONTHLY_PRICE_INR', '149'))
PREMIUM_YEARLY_PRICE_INR = int(os.environ.get('PREMIUM_YEARLY_PRICE_INR', '1499'))

AUTH_OTP_PROVIDER = os.environ.get('AUTH_OTP_PROVIDER', 'console').lower()
AUTH_OTP_EXPIRY_SECONDS = int(os.environ.get('AUTH_OTP_EXPIRY_SECONDS', '300'))
AUTH_OTP_RESEND_COOLDOWN_SECONDS = int(os.environ.get('AUTH_OTP_RESEND_COOLDOWN_SECONDS', '45'))
AUTH_OTP_MAX_ATTEMPTS = int(os.environ.get('AUTH_OTP_MAX_ATTEMPTS', '5'))

TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID', '')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '')
TWILIO_FROM_NUMBER = os.environ.get('TWILIO_FROM_NUMBER', '')

FAST2SMS_API_KEY = os.environ.get('FAST2SMS_API_KEY', '')
FAST2SMS_ROUTE = os.environ.get('FAST2SMS_ROUTE', 'q')
FAST2SMS_SENDER_ID = os.environ.get('FAST2SMS_SENDER_ID', '')

AUTH_SIGNUP_EMAIL_OTP_EXPIRY_SECONDS = int(os.environ.get('AUTH_SIGNUP_EMAIL_OTP_EXPIRY_SECONDS', '600'))
AUTH_SIGNUP_EMAIL_OTP_RESEND_COOLDOWN_SECONDS = int(os.environ.get('AUTH_SIGNUP_EMAIL_OTP_RESEND_COOLDOWN_SECONDS', '45'))
AUTH_SIGNUP_EMAIL_OTP_MAX_ATTEMPTS = int(os.environ.get('AUTH_SIGNUP_EMAIL_OTP_MAX_ATTEMPTS', '5'))

EMAIL_BACKEND = os.environ.get('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True') == 'True'
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER or 'no-reply@finyx.local')

CHATBOT_PROVIDER = os.environ.get('CHATBOT_PROVIDER', 'openrouter').lower()
CHATBOT_MODEL = os.environ.get('CHATBOT_MODEL', 'openai/gpt-4o-mini')
CHATBOT_API_KEY = os.environ.get('CHATBOT_API_KEY', '')
CHATBOT_API_ENDPOINT = os.environ.get('CHATBOT_API_ENDPOINT', 'https://openrouter.ai/api/v1/chat/completions')
CHATBOT_TIMEOUT_SECONDS = int(os.environ.get('CHATBOT_TIMEOUT_SECONDS', '30'))
CHATBOT_MAX_TOKENS = int(os.environ.get('CHATBOT_MAX_TOKENS', '350'))
CHATBOT_MAX_HISTORY = int(os.environ.get('CHATBOT_MAX_HISTORY', '10'))
CHATBOT_TEMPERATURE = float(os.environ.get('CHATBOT_TEMPERATURE', '0.4'))
CHATBOT_FALLBACK_LOCAL = os.environ.get('CHATBOT_FALLBACK_LOCAL', 'True') == 'True'
CHATBOT_SITE_URL = os.environ.get('CHATBOT_SITE_URL', 'http://localhost:3000')
CHATBOT_APP_NAME = os.environ.get('CHATBOT_APP_NAME', 'Finyx')

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
