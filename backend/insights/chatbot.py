import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


class ChatbotProviderError(Exception):
    pass


APP_FEATURE_GUIDE = {
    'dashboard': 'Financial overview with balances, monthly totals, alerts, and quick KPIs.',
    'transactions': 'Create, edit, filter, and categorize income/expense entries.',
    'budgets': 'Set monthly category limits and monitor overspending alerts.',
    'savings_goals': 'Track target amount, progress, and deadlines for goals.',
    'subscriptions': 'Track recurring payments and upcoming renewals.',
    'reports': 'View yearly trends, category spending, and savings analytics.',
    'insights': 'AI-generated financial observations and recommendations.',
    'tax_center': 'India tax summary, regime comparison, estimator, and suggestions.',
    'import': 'CSV import and receipt scanning for transaction extraction.',
    'profile': 'Manage personal settings, preferences, and plan details.',
}

APP_PAGE_GUIDE = {
    'dashboard': 'dashboard.html',
    'transactions': 'transactions.html',
    'budgets': 'budgets.html',
    'goals': 'goals.html',
    'subscriptions': 'subscriptions.html',
    'reports': 'reports.html',
    'insights': 'insights.html',
    'health_score': 'health-score.html',
    'simulator': 'simulator.html',
    'tax_center': 'tax-center.html',
    'import': 'import.html',
    'profile': 'profile.html',
}


def _normalize_text(value):
    text = str(value or '').lower()
    normalized = ''.join(ch if ch.isalnum() else ' ' for ch in text)
    return ' '.join(normalized.split())


def _matches_any(message, keywords):
    normalized_message = _normalize_text(message)
    padded_message = ' ' + normalized_message + ' '

    for keyword in keywords:
        normalized_keyword = _normalize_text(keyword)
        if not normalized_keyword:
            continue
        if (' ' + normalized_keyword + ' ') in padded_message:
            return True
    return False


def _format_currency(value, currency):
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0.0
    return f'{currency} {amount:,.2f}'


def _build_system_prompt(context):
    return (
        'You are Finyx Copilot, the in-app AI assistant for NextGen Smart Finance Manager. '
        'Answer any question related to this app: product usage, feature discovery, navigation, troubleshooting, and personalized finance guidance.\n\n'
        'Assistant rules:\n'
        '- Keep responses practical, clear, and action-oriented.\n'
        '- Ground suggestions in the provided user context whenever relevant.\n'
        '- If the user asks for a workflow, provide short step-by-step instructions using page names.\n'
        '- If the user asks something outside app scope, answer briefly and connect it back to what they can do inside Finyx.\n'
        '- Never claim you already changed account data or completed actions.\n'
        '- Mention Premium limitation only when it actually affects the asked feature.\n'
        '- For legal, tax, or investment decisions, provide educational guidance and recommend professional verification for final decisions.\n\n'
        f"App features: {json.dumps(APP_FEATURE_GUIDE, ensure_ascii=True)}\n"
        f"App pages: {json.dumps(APP_PAGE_GUIDE, ensure_ascii=True)}\n"
        f"User context: {json.dumps(context, ensure_ascii=True)}"
    )


def _build_messages(user_message, history, context):
    messages = [{'role': 'system', 'content': _build_system_prompt(context)}]
    messages.extend(history)
    messages.append({'role': 'user', 'content': user_message})
    return messages


def _call_openrouter(messages):
    provider_name = (getattr(settings, 'CHATBOT_PROVIDER', 'openrouter') or 'openrouter').strip().lower()
    endpoint = (getattr(settings, 'CHATBOT_API_ENDPOINT', '') or '').strip() or 'https://openrouter.ai/api/v1/chat/completions'
    api_key = (getattr(settings, 'CHATBOT_API_KEY', '') or '').strip()
    model = (getattr(settings, 'CHATBOT_MODEL', '') or '').strip() or 'openai/gpt-4o-mini'
    timeout_seconds = int(getattr(settings, 'CHATBOT_TIMEOUT_SECONDS', 30) or 30)
    max_tokens = int(getattr(settings, 'CHATBOT_MAX_TOKENS', 350) or 350)
    temperature = float(getattr(settings, 'CHATBOT_TEMPERATURE', 0.4) or 0.4)

    if not api_key:
        raise ChatbotProviderError('Chatbot API key is not configured on server.')

    payload = {
        'model': model,
        'messages': messages,
        'max_tokens': max_tokens,
        'temperature': temperature,
    }

    headers = {
        'Authorization': 'Bearer ' + api_key,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }

    site_url = (getattr(settings, 'CHATBOT_SITE_URL', '') or '').strip()
    app_name = (getattr(settings, 'CHATBOT_APP_NAME', '') or '').strip()
    if site_url:
        headers['HTTP-Referer'] = site_url
    if app_name:
        headers['X-Title'] = app_name

    req = Request(
        url=endpoint,
        data=json.dumps(payload).encode('utf-8'),
        headers=headers,
        method='POST',
    )

    try:
        with urlopen(req, timeout=timeout_seconds) as response:
            body = response.read().decode('utf-8')
            parsed = json.loads(body) if body else {}
    except HTTPError as exc:
        raw = ''
        try:
            raw = exc.read().decode('utf-8')
        except Exception:
            raw = ''

        message = 'Chatbot provider request failed.'
        if raw:
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    err = parsed.get('error')
                    if isinstance(err, dict):
                        message = err.get('message') or err.get('code') or message
                    elif isinstance(err, str):
                        message = err
                    else:
                        message = parsed.get('message') or message
            except (TypeError, ValueError):
                message = raw[:300]
        raise ChatbotProviderError(message)
    except URLError:
        raise ChatbotProviderError('Could not connect to chatbot provider. Please try again.')

    choices = parsed.get('choices') or []
    if not choices:
        raise ChatbotProviderError('Chatbot provider returned no response.')

    first_choice = choices[0] or {}
    content = ((first_choice.get('message') or {}).get('content') or '').strip()
    if not content:
        raise ChatbotProviderError('Chatbot provider returned an empty message.')

    return content, {'provider': provider_name, 'model': model, 'is_fallback': False}


def _local_fallback_reply(user_message, context):
    msg = (user_message or '').strip()
    monthly_income = float(context.get('monthly_income') or 0)
    monthly_expense = float(context.get('monthly_expense') or 0)
    monthly_transactions = int(context.get('monthly_transaction_count') or 0)
    budget_alerts = int(context.get('budget_alert_count') or 0)
    active_subscriptions = int(context.get('active_subscription_count') or 0)
    savings_goal_count = int(context.get('savings_goal_count') or 0)
    account_count = int(context.get('account_count') or 0)
    is_premium = bool(context.get('is_premium_active'))
    plan = context.get('plan') or 'basic'
    top_expense_category = (context.get('top_expense_category') or '').strip()
    top_expense_amount = float(context.get('top_expense_amount') or 0)
    currency = context.get('currency') or 'INR'
    free_cash = monthly_income - monthly_expense

    if not msg:
        return (
            'Ask me anything about using this app, including transactions, budgets, goals, subscriptions, reports, tax center, or import workflows.'
        )

    if _matches_any(msg, ['hello', 'hi', 'hey', 'good morning', 'good evening']):
        return (
            'I can help with any app-related question. Try asking:\n'
            '- How do I import transactions from CSV?\n'
            '- What should I do about my budget alerts?\n'
            '- Which page shows yearly trends and category spend?'
        )

    if _matches_any(msg, ['dashboard', 'overview', 'home page', 'snapshot']):
        return (
            'Open Dashboard (dashboard.html) for your full snapshot. You can review total balance, income vs expenses, budget alerts, recent transactions, and AI insights in one place.'
        )

    if _matches_any(msg, ['transaction', 'income', 'expense', 'merchant', 'category', 'edit entry', 'add entry']):
        tip = ''
        if monthly_transactions > 0:
            tip = f' You currently have {monthly_transactions} transactions this month.'
        return (
            'Use Transactions (transactions.html) to add, edit, filter, and categorize entries. '\
            'For cleaner analytics, keep notes and merchant names consistent.' + tip
        )

    if _matches_any(msg, ['import', 'csv', 'receipt', 'upload statement', 'bank statement', 'ocr', 'scan']):
        receipt_note = ''
        if not is_premium:
            receipt_note = ' Receipt scanning and CSV import may require Premium based on your plan.'
        return (
            'Go to Import Data (import.html). Upload a CSV for preview and mapping, or upload a receipt image to extract transaction details before saving.'
            + receipt_note
        )

    if _matches_any(msg, ['budget', 'overspend', 'limit', 'spending cap', 'budget alert']):
        if budget_alerts > 0:
            return (
                f'You currently have {budget_alerts} budget alerts. Start with Budgets (budgets.html), tighten the top overspending categories, and set smaller weekly limits. '
                f'Estimated free cash flow this month is {_format_currency(free_cash, currency)}.'
            )
        return (
            'Use Budgets (budgets.html) to set monthly category caps. Then monitor alerts and adjust limits for categories with repeated spikes.'
        )

    if _matches_any(msg, ['save', 'savings', 'goal', 'deadline', 'target amount']):
        if free_cash <= 0:
            return (
                'Use Savings Goals (goals.html), but first free up cash flow by reducing non-essential expenses. Once positive, automate a fixed monthly contribution.'
            )
        recommended = max(free_cash * 0.35, 500)
        return (
            f'You have {savings_goal_count} active goals. In Savings Goals (goals.html), set target dates and automate about '
            f'{_format_currency(recommended, currency)} per month to accelerate progress.'
        )

    if _matches_any(msg, ['subscription', 'recurring', 'renewal', 'autopay']):
        return (
            f'You have {active_subscriptions} active subscriptions. In Subscriptions (subscriptions.html), sort by amount and next renewal, then cancel low-value services first.'
        )

    if _matches_any(msg, ['report', 'analytics', 'trend', 'chart', 'yearly']):
        return (
            'Open Reports (reports.html) for yearly trend analysis, category breakdown, and savings trajectory. Use this view before adjusting budgets and goals.'
        )

    if _matches_any(msg, ['insight', 'ai insight', 'recommendation', 'advice']):
        focus = ''
        if top_expense_category:
            focus = f' Your current top expense category is {top_expense_category} ({_format_currency(top_expense_amount, currency)} this month).'
        return (
            'Open AI Insights (insights.html) to review warnings, trend signals, and category-level suggestions.' + focus
        )

    if _matches_any(msg, ['tax', '80c', '80d', 'regime', 'deduction']):
        return (
            'Use Tax Center (tax-center.html) for deduction tracking, old-vs-new regime comparison, tax estimation, and suggestions. '\
            'Treat outputs as planning guidance and verify final filing details with a tax professional.'
        )

    if _matches_any(msg, ['premium', 'upgrade', 'plan', 'billing', 'subscription plan']):
        premium_label = 'active' if is_premium else 'inactive'
        return (
            f'Your plan is {plan} (Premium {premium_label}). Open Profile (profile.html) to review plan details or upgrade. '
            'Premium unlocks advanced AI and automation workflows.'
        )

    if _matches_any(msg, ['profile', 'account', 'theme', 'dark mode', 'light mode', 'font size', 'settings']):
        return (
            f'Use Profile (profile.html) for account preferences and plan info. You can also change theme and font size from the top bar on app pages. '
            f'You currently have {account_count} linked account records.'
        )

    if _matches_any(msg, ['login', 'sign in', 'signup', 'otp', 'verification', 'password', 'email verification']):
        return (
            'For access issues, verify signup email OTP completion first, then retry login from login.html. '
            'If needed, use the app support/admin flow to review account status and role permissions.'
        )

    if _matches_any(msg, ['error', 'bug', 'issue', 'problem', 'not working', 'failed']):
        return (
            'Quick troubleshooting: 1) refresh the page, 2) re-login, 3) verify required fields, 4) retry with smaller input, and 5) check your plan access for premium features. '
            'If you share the exact page and action, I can provide a targeted fix path.'
        )

    return (
        'I can answer broad app-context questions across dashboard usage, transaction workflows, imports, budgets, goals, subscriptions, reports, insights, tax center, and troubleshooting. '
        'Ask your question with the page or task name and I will give a direct action plan.'
    )


def get_chatbot_reply(user_message, history, context):
    provider = (getattr(settings, 'CHATBOT_PROVIDER', 'openrouter') or 'openrouter').strip().lower()
    fallback_local = bool(getattr(settings, 'CHATBOT_FALLBACK_LOCAL', True))
    messages = _build_messages(user_message, history, context)

    if provider in {'openrouter', 'openai_compatible'}:
        try:
            return _call_openrouter(messages)
        except ChatbotProviderError:
            if not fallback_local:
                raise
            local_reply = _local_fallback_reply(user_message, context)
            return local_reply, {'provider': 'local', 'model': 'heuristic', 'is_fallback': True}

    if provider == 'local':
        local_reply = _local_fallback_reply(user_message, context)
        return local_reply, {'provider': 'local', 'model': 'heuristic', 'is_fallback': True}

    raise ChatbotProviderError('Unsupported chatbot provider configuration.')
