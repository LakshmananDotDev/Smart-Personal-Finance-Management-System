from datetime import date

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from tax.services import TaxOptimizerService
from users.entitlements import is_premium_active, build_premium_required_payload


def _parse_year(request):
    year_param = request.query_params.get('year')
    if not year_param:
        return date.today().year

    try:
        year = int(year_param)
    except (TypeError, ValueError):
        raise ValueError('year must be a number')

    if year < 2000 or year > 2100:
        raise ValueError('year must be between 2000 and 2100')

    return year


def _premium_gate(request, feature_key):
    if is_premium_active(request.user):
        return None

    payload = build_premium_required_payload(request.user, feature_key)
    return Response(payload, status=status.HTTP_403_FORBIDDEN)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tax_summary(request):
    try:
        year = _parse_year(request)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    service = TaxOptimizerService(request.user, year)
    return Response(service.get_summary())


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def regime_comparison(request):
    blocked = _premium_gate(request, 'tax_regime_comparison')
    if blocked:
        return blocked

    try:
        year = _parse_year(request)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    service = TaxOptimizerService(request.user, year)
    return Response(service.get_regime_comparison())


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tax_estimator(request):
    blocked = _premium_gate(request, 'tax_estimator')
    if blocked:
        return blocked

    try:
        year = _parse_year(request)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    service = TaxOptimizerService(request.user, year)
    return Response(service.get_estimator())


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tax_suggestions(request):
    blocked = _premium_gate(request, 'tax_suggestions')
    if blocked:
        return blocked

    try:
        year = _parse_year(request)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    service = TaxOptimizerService(request.user, year)
    suggestions = service.get_suggestions()
    return Response({
        'year': year,
        'count': len(suggestions),
        'suggestions': suggestions,
    })
