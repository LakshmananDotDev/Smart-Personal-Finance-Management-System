from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from django.db.models import Sum
from django.utils import timezone
from insights.engine import InsightsEngine
from insights.chatbot import get_chatbot_reply, ChatbotProviderError
from insights.categorizer import auto_categorize, suggest_categories, infer_tax_section
from insights.receipt_scanner import extract_from_text, process_image
from insights.health_score import HealthScoreCalculator
from insights.subscription_detector import detect_subscriptions, get_subscription_summary
from insights.goal_planner import GoalPlanner
from insights.simulator import WhatIfSimulator
from insights.behavioral import BehavioralEngine
from insights.alerts import check_budget_alerts
from insights.csv_importer import preview_csv, import_csv
from finance.models import Transaction, Subscription, Budget, SavingsGoal, Account
from users.entitlements import (
    is_premium_active,
    build_premium_required_payload,
    get_premium_days_left,
)


def _premium_gate(request, feature_key):
    if is_premium_active(request.user):
        return None

    payload = build_premium_required_payload(request.user, feature_key)
    return Response(payload, status=status.HTTP_403_FORBIDDEN)


def _sanitize_chat_history(raw_history):
    if not isinstance(raw_history, list):
        return []

    max_turns = int(getattr(settings, 'CHATBOT_MAX_HISTORY', 6) or 6)
    cleaned = []
    for item in raw_history[-max_turns:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get('role', '')).strip().lower()
        if role not in {'user', 'assistant'}:
            continue
        content = str(item.get('content', '')).strip()
        if not content:
            continue
        cleaned.append({'role': role, 'content': content[:1000]})
    return cleaned


def _build_chat_context(user):
    today = timezone.now().date()
    tx_qs = Transaction.objects.filter(user=user, date__month=today.month, date__year=today.year)
    monthly_income = tx_qs.filter(type='income').aggregate(total=Sum('amount')).get('total') or 0
    monthly_expense = tx_qs.filter(type='expense').aggregate(total=Sum('amount')).get('total') or 0
    premium_active = is_premium_active(user)

    top_expense = (
        tx_qs.filter(type='expense')
        .values('category__name')
        .annotate(total=Sum('amount'))
        .order_by('-total')
        .first()
    )

    return {
        'username': user.username,
        'first_name': user.first_name or '',
        'role': user.role or 'member',
        'plan': user.plan or 'basic',
        'is_premium_active': premium_active,
        'premium_days_left': get_premium_days_left(user) if premium_active else 0,
        'is_onboarded': bool(user.is_onboarded),
        'currency': user.currency or 'INR',
        'month': today.month,
        'year': today.year,
        'monthly_income': float(monthly_income),
        'monthly_expense': float(monthly_expense),
        'monthly_transaction_count': tx_qs.count(),
        'account_count': Account.objects.filter(user=user).count(),
        'budget_count': Budget.objects.filter(user=user, month=today.month, year=today.year).count(),
        'savings_goal_count': SavingsGoal.objects.filter(user=user).count(),
        'active_subscription_count': Subscription.objects.filter(user=user, is_active=True).count(),
        'budget_alert_count': len(check_budget_alerts(user)),
        'top_expense_category': (top_expense or {}).get('category__name') or '',
        'top_expense_amount': float((top_expense or {}).get('total') or 0),
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def chatbot_reply(request):
    message = str(request.data.get('message', '')).strip()
    if not message:
        return Response({'error': 'message is required'}, status=status.HTTP_400_BAD_REQUEST)
    if len(message) > 2000:
        return Response({'error': 'message is too long'}, status=status.HTTP_400_BAD_REQUEST)

    history = _sanitize_chat_history(request.data.get('history', []))
    context = _build_chat_context(request.user)

    try:
        reply, meta = get_chatbot_reply(message, history, context)
    except ChatbotProviderError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    return Response({
        'reply': reply,
        'provider': meta.get('provider', 'unknown'),
        'model': meta.get('model', ''),
        'is_fallback': bool(meta.get('is_fallback', False)),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_insights(request):
    engine = InsightsEngine(request.user)
    insights = engine.generate_all_insights()

    is_premium = is_premium_active(request.user)
    limited = not is_premium
    if limited:
        insights = insights[:3]

    return Response({
        'count': len(insights),
        'insights': insights,
        'is_limited': limited,
        'upgrade_message': 'Upgrade to Premium to unlock all AI insights.' if limited else '',
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def auto_categorize_view(request):
    text = request.data.get('text', '')
    if not text:
        return Response({'error': 'text is required'}, status=status.HTTP_400_BAD_REQUEST)
    result = auto_categorize(text, request.user)
    suggestions = suggest_categories(text, request.user)
    return Response({
        'best_match': result,
        'suggestions': suggestions,
        'tax_section': infer_tax_section(text),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def scan_receipt(request):
    blocked = _premium_gate(request, 'receipt_scan')
    if blocked:
        return blocked

    text = request.data.get('text', '')
    image = request.FILES.get('image')

    if image:
        content_type = (getattr(image, 'content_type', '') or '').lower()
        if content_type and not content_type.startswith('image/'):
            return Response({'error': 'Only image files are supported for receipt photo scan.'}, status=status.HTTP_400_BAD_REQUEST)

        result = process_image(image)
        if result.get('error') and text:
            fallback = extract_from_text(text)
            fallback['warning'] = 'Image OCR failed. Used pasted text instead.'
            result = fallback

        if result.get('error') and not result.get('raw_text'):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
    elif text:
        result = extract_from_text(text)
    else:
        return Response({'error': 'Provide text or image'}, status=status.HTTP_400_BAD_REQUEST)

    # Auto-categorize extracted merchant/description
    description = result.get('merchant', '') or text
    cat_result = auto_categorize(description, request.user)
    if cat_result:
        result['suggested_category'] = cat_result

    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def health_score(request):
    blocked = _premium_gate(request, 'health_score')
    if blocked:
        return blocked

    calc = HealthScoreCalculator(request.user)
    return Response(calc.calculate())


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def subscription_detect(request):
    blocked = _premium_gate(request, 'subscription_detection')
    if blocked:
        return blocked

    candidates = detect_subscriptions(request.user)
    summary = get_subscription_summary(request.user)
    return Response({
        'detected': candidates,
        'summary': summary,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def goal_plan(request):
    blocked = _premium_gate(request, 'goal_plan')
    if blocked:
        return blocked

    goal_id = request.query_params.get('goal_id')
    if not goal_id:
        return Response({'error': 'goal_id is required'}, status=status.HTTP_400_BAD_REQUEST)
    planner = GoalPlanner(request.user)
    plan = planner.generate_plan(int(goal_id))
    return Response(plan)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def simulator_baseline(request):
    blocked = _premium_gate(request, 'simulator')
    if blocked:
        return blocked

    sim = WhatIfSimulator(request.user)
    return Response(sim.get_baseline())


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def simulate(request):
    blocked = _premium_gate(request, 'simulator')
    if blocked:
        return blocked

    adjustments = request.data.get('adjustments', {})
    months = int(request.data.get('months', 12))
    sim = WhatIfSimulator(request.user)
    return Response(sim.simulate(adjustments, months))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def behavioral_insights(request):
    blocked = _premium_gate(request, 'behavioral_insights')
    if blocked:
        return blocked

    engine = BehavioralEngine(request.user)
    return Response({
        'patterns': engine.analyze(),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def budget_alerts(request):
    alerts = check_budget_alerts(request.user)
    return Response({
        'count': len(alerts),
        'alerts': alerts,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def csv_preview(request):
    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'CSV file is required'}, status=status.HTTP_400_BAD_REQUEST)
    content = file.read()
    result = preview_csv(content)
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def csv_import(request):
    blocked = _premium_gate(request, 'csv_import')
    if blocked:
        return blocked

    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'CSV file is required'}, status=status.HTTP_400_BAD_REQUEST)
    mapping_str = request.data.get('mapping', '')
    mapping = None
    if mapping_str:
        import json
        try:
            mapping = json.loads(mapping_str)
        except (json.JSONDecodeError, ValueError):
            return Response({'error': 'Invalid mapping JSON'}, status=status.HTTP_400_BAD_REQUEST)
    content = file.read()
    result = import_csv(content, request.user, column_mapping=mapping)
    return Response(result)
