from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Sum, Q
from datetime import date
from decimal import Decimal
from finance.models import Category, Transaction, Budget, SavingsGoal, Account, Subscription, GoalContribution
from finance.serializers import (
    CategorySerializer, TransactionSerializer,
    BudgetSerializer, SavingsGoalSerializer,
    AccountSerializer, SubscriptionSerializer,
    GoalContributionSerializer
)
from finance.selectors.transaction_selector import build_spending_hotspots, build_transaction_queryset
from finance.services.transaction_service import create_transaction, update_transaction
from common.api.pagination import StandardResultsSetPagination
from users.audit import log_audit_event
from users.entitlements import build_plan_limit_payload


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return Category.objects.filter(
            Q(user=self.request.user) | Q(is_default=True)
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class AccountViewSet(viewsets.ModelViewSet):
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return Account.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        existing_count = Account.objects.filter(user=request.user).count()
        limit_payload = build_plan_limit_payload(request.user, 'accounts', existing_count)
        if limit_payload:
            return Response(limit_payload, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class SubscriptionViewSet(viewsets.ModelViewSet):
    serializer_class = SubscriptionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return Subscription.objects.filter(user=self.request.user).select_related('category')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return build_transaction_queryset(self.request.user, self.request.query_params)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tx = create_transaction(request.user, serializer.validated_data)

        log_audit_event(
            user=request.user,
            action='finance.transaction_created',
            resource_type='transaction',
            resource_id=tx.id,
            metadata={'type': tx.type, 'amount': str(tx.amount)},
            request=request,
        )

        return Response(self.get_serializer(tx).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        tx = update_transaction(instance, serializer.validated_data, request.user)

        log_audit_event(
            user=request.user,
            action='finance.transaction_updated',
            resource_type='transaction',
            resource_id=tx.id,
            metadata={'type': tx.type, 'amount': str(tx.amount)},
            request=request,
        )

        return Response(self.get_serializer(tx).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        tx_id = instance.id
        super().destroy(request, *args, **kwargs)

        log_audit_event(
            user=request.user,
            action='finance.transaction_deleted',
            resource_type='transaction',
            resource_id=tx_id,
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'], url_path='spending-map')
    def spending_map(self, request):
        qs = build_transaction_queryset(request.user, request.query_params).filter(type='expense')
        grouped = build_spending_hotspots(qs)

        hotspots = [
            {
                'location_name': item['location_name'] or 'Unknown location',
                'latitude': float(item['latitude']),
                'longitude': float(item['longitude']),
                'total_spent': float(item['total_spent'] or 0),
                'transaction_count': item['transaction_count'],
                'last_spent': item['last_spent'],
            }
            for item in grouped
        ]

        mapped_total = qs.aggregate(total=Sum('amount'))['total'] or 0

        return Response({
            'hotspot_count': len(hotspots),
            'total_mapped_expense': float(mapped_total),
            'hotspots': hotspots,
        })


class BudgetViewSet(viewsets.ModelViewSet):
    serializer_class = BudgetSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = Budget.objects.filter(user=self.request.user).select_related('category')
        month = self.request.query_params.get('month')
        year = self.request.query_params.get('year')
        if month and year:
            qs = qs.filter(month=int(month), year=int(year))
        return qs

    def create(self, request, *args, **kwargs):
        existing_count = Budget.objects.filter(user=request.user).count()
        limit_payload = build_plan_limit_payload(request.user, 'budgets', existing_count)
        if limit_payload:
            return Response(limit_payload, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class SavingsGoalViewSet(viewsets.ModelViewSet):
    serializer_class = SavingsGoalSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return SavingsGoal.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        existing_count = SavingsGoal.objects.filter(user=request.user).count()
        limit_payload = build_plan_limit_payload(request.user, 'savings_goals', existing_count)
        if limit_payload:
            return Response(limit_payload, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'], url_path='add-funds')
    def add_funds(self, request, pk=None):
        goal = self.get_object()
        amount = request.data.get('amount')
        account_id = request.data.get('account_id')
        notes = request.data.get('notes', '')

        if not amount or float(amount) <= 0:
            return Response({'error': 'Amount must be positive.'}, status=status.HTTP_400_BAD_REQUEST)

        amount = Decimal(str(amount))

        # Validate account if provided
        account = None
        if account_id:
            try:
                account = Account.objects.get(id=account_id, user=request.user)
            except Account.DoesNotExist:
                return Response({'error': 'Account not found.'}, status=status.HTTP_400_BAD_REQUEST)

        # Find or create a "Savings" category for the transaction
        savings_cat, _ = Category.objects.get_or_create(
            name='Savings', is_default=True,
            defaults={'type': 'expense', 'icon': 'piggy-bank', 'color': '#10b981'}
        )

        # Create a transaction record
        tx = Transaction.objects.create(
            user=request.user,
            type='expense',
            amount=amount,
            category=savings_cat,
            account=account,
            date=date.today(),
            notes=notes or f'Savings: {goal.name}',
            merchant=goal.name,
        )

        # Update goal's current amount
        goal.current_amount += amount
        goal.save(update_fields=['current_amount', 'updated_at'])

        # Deduct from account balance if account is provided
        if account:
            account.balance -= amount
            account.save(update_fields=['balance', 'updated_at'])

        # Log the contribution
        contribution = GoalContribution.objects.create(
            goal=goal,
            amount=amount,
            account=account,
            transaction=tx,
            notes=notes,
        )

        log_audit_event(
            user=request.user,
            action='finance.goal_contribution_added',
            resource_type='savings_goal',
            resource_id=goal.id,
            metadata={'amount': str(amount), 'account_id': account.id if account else None},
            request=request,
        )

        return Response({
            'message': f'Added ₹{amount} to {goal.name}',
            'goal': SavingsGoalSerializer(goal).data,
            'contribution': GoalContributionSerializer(contribution).data,
            'transaction_id': tx.id,
        })

    @action(detail=True, methods=['get'], url_path='contributions')
    def contributions(self, request, pk=None):
        goal = self.get_object()
        contribs = GoalContribution.objects.filter(goal=goal)
        return Response({
            'contributions': GoalContributionSerializer(contribs, many=True).data,
        })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    today = date.today()
    current_month = today.month
    current_year = today.year

    month_transactions = Transaction.objects.filter(
        user=request.user,
        date__month=current_month,
        date__year=current_year,
    ).select_related('category', 'account')

    total_income = month_transactions.filter(type='income').aggregate(
        total=Sum('amount')
    )['total'] or 0

    total_expenses = month_transactions.filter(type='expense').aggregate(
        total=Sum('amount')
    )['total'] or 0

    balance = float(total_income) - float(total_expenses)

    expense_by_category = (
        month_transactions
        .filter(type='expense')
        .values('category__name', 'category__color', 'category__icon')
        .annotate(total=Sum('amount'))
        .order_by('-total')
    )

    income_by_category = (
        month_transactions
        .filter(type='income')
        .values('category__name', 'category__color')
        .annotate(total=Sum('amount'))
        .order_by('-total')
    )

    recent_transactions = TransactionSerializer(
        month_transactions[:10], many=True
    ).data

    budgets = Budget.objects.filter(
        user=request.user, month=current_month, year=current_year
    ).select_related('category')

    budget_alerts = []
    for budget in budgets:
        spent = month_transactions.filter(
            type='expense', category=budget.category
        ).aggregate(total=Sum('amount'))['total'] or 0
        percentage = float(spent) / float(budget.amount) * 100 if budget.amount > 0 else 0
        if percentage >= 80:
            budget_alerts.append({
                'category': budget.category.name,
                'budget': float(budget.amount),
                'spent': float(spent),
                'percentage': round(percentage, 1),
            })

    savings_goals = SavingsGoalSerializer(
        SavingsGoal.objects.filter(user=request.user), many=True
    ).data

    # Monthly breakdown (last 6 months) for Income vs Expense chart
    monthly_breakdown = []
    for i in range(5, -1, -1):
        m = current_month - i
        y = current_year
        while m <= 0:
            m += 12
            y -= 1
        m_qs = Transaction.objects.filter(user=request.user, date__month=m, date__year=y)
        inc = m_qs.filter(type='income').aggregate(t=Sum('amount'))['t'] or 0
        exp = m_qs.filter(type='expense').aggregate(t=Sum('amount'))['t'] or 0
        month_name = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]
        monthly_breakdown.append({
            'month': month_name + ' ' + str(y),
            'income': float(inc),
            'expenses': float(exp),
        })

    return Response({
        'month': current_month,
        'year': current_year,
        'total_income': float(total_income),
        'total_expenses': float(total_expenses),
        'balance': balance,
        'expense_by_category': [
            {
                'name': item['category__name'],
                'color': item['category__color'],
                'icon': item['category__icon'],
                'total': float(item['total']),
            }
            for item in expense_by_category
        ],
        'income_by_category': [
            {
                'name': item['category__name'],
                'color': item['category__color'],
                'total': float(item['total']),
            }
            for item in income_by_category
        ],
        'recent_transactions': recent_transactions,
        'budget_alerts': budget_alerts,
        'savings_goals': savings_goals,
        'monthly_breakdown': monthly_breakdown,
        'transaction_count': month_transactions.count(),
        'income_count': month_transactions.filter(type='income').count(),
        'expense_count': month_transactions.filter(type='expense').count(),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def reports(request):
    period = request.query_params.get('period')  # 'all' for all-time
    year = request.query_params.get('year')
    month = request.query_params.get('month')

    qs = Transaction.objects.filter(user=request.user)
    if period != 'all':
        year = int(year or date.today().year)
        qs = qs.filter(date__year=year)
    if month:
        qs = qs.filter(date__month=int(month))

    monthly_data = []
    for m in range(1, 13):
        month_qs = Transaction.objects.filter(
            user=request.user, date__year=year, date__month=m
        )
        inc = month_qs.filter(type='income').aggregate(t=Sum('amount'))['t'] or 0
        exp = month_qs.filter(type='expense').aggregate(t=Sum('amount'))['t'] or 0
        monthly_data.append({
            'month': m,
            'income': float(inc),
            'expenses': float(exp),
            'savings': float(inc) - float(exp),
        })

    expense_by_category = (
        qs.filter(type='expense')
        .values('category__name', 'category__color', 'category__icon')
        .annotate(total=Sum('amount'))
        .order_by('-total')
    )

    income_by_category = (
        qs.filter(type='income')
        .values('category__name', 'category__color')
        .annotate(total=Sum('amount'))
        .order_by('-total')
    )

    total_income = qs.filter(type='income').aggregate(t=Sum('amount'))['t'] or 0
    total_expenses = qs.filter(type='expense').aggregate(t=Sum('amount'))['t'] or 0

    return Response({
        'year': year if period != 'all' else None,
        'month': int(month) if month else None,
        'period': period or 'yearly',
        'total_income': float(total_income),
        'total_expenses': float(total_expenses),
        'net_savings': float(total_income) - float(total_expenses),
        'transaction_count': qs.count(),
        'income_count': qs.filter(type='income').count(),
        'expense_count': qs.filter(type='expense').count(),
        'monthly_data': monthly_data,
        'expense_by_category': [
            {
                'name': item['category__name'],
                'color': item['category__color'],
                'icon': item['category__icon'],
                'total': float(item['total']),
            }
            for item in expense_by_category
        ],
        'income_by_category': [
            {
                'name': item['category__name'],
                'color': item['category__color'],
                'total': float(item['total']),
            }
            for item in income_by_category
        ],
    })
