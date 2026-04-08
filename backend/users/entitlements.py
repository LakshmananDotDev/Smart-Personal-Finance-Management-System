import math

from django.conf import settings
from django.utils import timezone


PLAN_BASIC = 'basic'
PLAN_PREMIUM = 'premium'

BASIC_LIMITS = {
    'accounts': 2,
    'budgets': 5,
    'savings_goals': 2,
}

PREMIUM_LIMITS = {
    'accounts': None,
    'budgets': None,
    'savings_goals': None,
}

PREMIUM_FEATURES = {
    'health_score',
    'behavioral_insights',
    'goal_plan',
    'simulator',
    'subscription_detection',
    'receipt_scan',
    'csv_import',
    'tax_regime_comparison',
    'tax_estimator',
    'tax_suggestions',
}

PREMIUM_FEATURE_LABELS = {
    'health_score': 'Financial Health Score',
    'behavioral_insights': 'Behavioral Insights',
    'goal_plan': 'AI Goal Planner',
    'simulator': 'What-If Simulator',
    'subscription_detection': 'Subscription Auto-Detection',
    'receipt_scan': 'Receipt Scanner',
    'csv_import': 'CSV Import',
    'tax_regime_comparison': 'Tax Regime Comparison',
    'tax_estimator': 'Tax Estimator',
    'tax_suggestions': 'Tax Suggestions',
}

RESOURCE_LABELS = {
    'accounts': 'accounts',
    'budgets': 'budgets',
    'savings_goals': 'savings goals',
}


def _as_positive_int(value, default_value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default_value

    return parsed if parsed > 0 else default_value


def get_pricing_catalog():
    monthly_price = _as_positive_int(getattr(settings, 'PREMIUM_MONTHLY_PRICE_INR', 149), 149)
    yearly_price = _as_positive_int(getattr(settings, 'PREMIUM_YEARLY_PRICE_INR', 1499), 1499)

    return {
        'monthly': {
            'code': 'monthly',
            'label': 'Premium Monthly',
            'description': 'Monthly premium access',
            'amount_inr': monthly_price,
            'amount_paise': monthly_price * 100,
            'duration_days': 30,
        },
        'yearly': {
            'code': 'yearly',
            'label': 'Premium Yearly',
            'description': 'Yearly premium access',
            'amount_inr': yearly_price,
            'amount_paise': yearly_price * 100,
            'duration_days': 365,
        },
    }


def get_plan_offer(plan_code):
    return get_pricing_catalog().get((plan_code or '').strip().lower())


def is_premium_active(user):
    if not user:
        return False

    if (user.plan or PLAN_BASIC) != PLAN_PREMIUM:
        return False

    expires_at = getattr(user, 'premium_expires_at', None)
    if not expires_at:
        return False

    return expires_at >= timezone.now()


def get_effective_plan(user):
    return PLAN_PREMIUM if is_premium_active(user) else PLAN_BASIC


def get_limits_for_user(user):
    if is_premium_active(user):
        return dict(PREMIUM_LIMITS)
    return dict(BASIC_LIMITS)


def get_premium_days_left(user):
    if not is_premium_active(user):
        return 0

    expires_at = user.premium_expires_at
    delta_seconds = max(0.0, (expires_at - timezone.now()).total_seconds())
    return int(math.ceil(delta_seconds / 86400.0))


def build_entitlements_payload(user):
    is_premium = is_premium_active(user)
    premium_expires_at = getattr(user, 'premium_expires_at', None)

    return {
        'plan': get_effective_plan(user),
        'is_premium': is_premium,
        'premium_expires_at': premium_expires_at if is_premium else None,
        'premium_days_left': get_premium_days_left(user),
        'limits': get_limits_for_user(user),
        'pricing': get_pricing_catalog(),
        'premium_features': sorted(list(PREMIUM_FEATURES)),
    }


def has_feature_access(user, feature_key):
    if feature_key not in PREMIUM_FEATURES:
        return True
    return is_premium_active(user)


def build_premium_required_payload(user, feature_key):
    feature = (feature_key or '').strip().lower()
    feature_label = PREMIUM_FEATURE_LABELS.get(feature, 'This feature')

    return {
        'error': feature_label + ' is available on Premium plan.',
        'error_code': 'premium_required',
        'upgrade_required': True,
        'feature': feature,
        'feature_label': feature_label,
        'entitlements': build_entitlements_payload(user),
    }


def build_plan_limit_payload(user, resource_key, current_count):
    limits = get_limits_for_user(user)
    limit = limits.get(resource_key)
    if limit is None:
        return None

    if current_count < limit:
        return None

    resource_label = RESOURCE_LABELS.get(resource_key, resource_key)
    return {
        'error': 'Basic plan allows up to {0} {1}. Upgrade to Premium for unlimited access.'.format(limit, resource_label),
        'error_code': 'plan_limit_reached',
        'upgrade_required': True,
        'resource': resource_key,
        'limit': limit,
        'current_count': current_count,
        'entitlements': build_entitlements_payload(user),
    }