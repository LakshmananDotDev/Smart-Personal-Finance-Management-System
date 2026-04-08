from rest_framework import serializers
from finance.models import Category, Transaction, Budget, SavingsGoal, Account, Subscription, GoalContribution


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'type', 'icon', 'color', 'is_default', 'keywords']
        read_only_fields = ['id', 'is_default']


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ['id', 'name', 'type', 'balance', 'icon', 'color', 'is_default', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class SubscriptionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default='')

    class Meta:
        model = Subscription
        fields = [
            'id', 'name', 'amount', 'category', 'category_name',
            'frequency', 'is_active', 'detected_auto', 'next_date', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class TransactionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_icon = serializers.CharField(source='category.icon', read_only=True)
    category_color = serializers.CharField(source='category.color', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True, default='')

    class Meta:
        model = Transaction
        fields = [
            'id', 'type', 'amount', 'category', 'category_name',
            'category_icon', 'category_color', 'account', 'account_name',
            'date', 'notes', 'merchant', 'location_name', 'latitude', 'longitude',
            'tax_section',
            'is_subscription', 'auto_categorized',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Amount must be positive.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        instance = getattr(self, 'instance', None)
        lat = attrs.get('latitude', getattr(instance, 'latitude', None))
        lng = attrs.get('longitude', getattr(instance, 'longitude', None))

        if (lat is None) != (lng is None):
            raise serializers.ValidationError({'latitude': 'Latitude and longitude must be provided together.'})

        if lat is not None and (lat < -90 or lat > 90):
            raise serializers.ValidationError({'latitude': 'Latitude must be between -90 and 90.'})

        if lng is not None and (lng < -180 or lng > 180):
            raise serializers.ValidationError({'longitude': 'Longitude must be between -180 and 180.'})

        return attrs


class BudgetSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    spent = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()
    percentage = serializers.SerializerMethodField()

    class Meta:
        model = Budget
        fields = [
            'id', 'category', 'category_name', 'amount',
            'month', 'year', 'spent', 'remaining', 'percentage',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_spent(self, obj):
        total = Transaction.objects.filter(
            user=obj.user, category=obj.category,
            type='expense', date__month=obj.month, date__year=obj.year
        ).aggregate(total=serializers.models.Sum('amount'))['total']
        return float(total or 0)

    def get_remaining(self, obj):
        return float(obj.amount) - self.get_spent(obj)

    def get_percentage(self, obj):
        spent = self.get_spent(obj)
        if obj.amount == 0:
            return 0
        return round(spent / float(obj.amount) * 100, 1)

    def validate(self, attrs):
        if attrs.get('month') and (attrs['month'] < 1 or attrs['month'] > 12):
            raise serializers.ValidationError({'month': 'Must be between 1 and 12.'})
        if attrs.get('year') and attrs['year'] < 2000:
            raise serializers.ValidationError({'year': 'Invalid year.'})
        return attrs


class SavingsGoalSerializer(serializers.ModelSerializer):
    progress = serializers.ReadOnlyField()

    class Meta:
        model = SavingsGoal
        fields = [
            'id', 'name', 'target_amount', 'current_amount',
            'deadline', 'icon', 'progress', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_target_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Target amount must be positive.')
        return value


class GoalContributionSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source='account.name', read_only=True, default='')
    goal_name = serializers.CharField(source='goal.name', read_only=True)

    class Meta:
        model = GoalContribution
        fields = [
            'id', 'goal', 'goal_name', 'amount', 'account',
            'account_name', 'transaction', 'notes', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']
