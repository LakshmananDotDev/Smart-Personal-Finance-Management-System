from users.models import AuditLog


def _extract_ip(request):
    if not request:
        return None

    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()

    return request.META.get('REMOTE_ADDR')


def _extract_user_agent(request):
    if not request:
        return ''
    return request.META.get('HTTP_USER_AGENT', '')[:255]


def log_audit_event(user, action, resource_type='', resource_id='', metadata=None, request=None):
    if not action:
        return

    AuditLog.objects.create(
        actor=user if getattr(user, 'is_authenticated', False) else None,
        action=action,
        resource_type=resource_type or '',
        resource_id=str(resource_id or ''),
        metadata=metadata or {},
        ip_address=_extract_ip(request),
        user_agent=_extract_user_agent(request),
    )
