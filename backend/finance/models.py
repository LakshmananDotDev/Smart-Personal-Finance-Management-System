from django.db import models
from django.conf import settings


class Account(models.Model):
    ACCOUNT_TYPES = [
        ('cash', 'Cash'),
        ('bank', 'Bank'),
        ('upi', 'UPI'),
        ('credit', 'Credit Card'),
        ('wallet', 'Wallet'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='accounts'
    )
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=10, choices=ACCOUNT_TYPES, default='bank')
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    icon = models.CharField(max_length=50, default='wallet')
    color = models.CharField(max_length=7, default='#6366f1')
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'accounts'
        ordering = ['-is_default', 'name']

    def __str__(self):
        return f"{self.name} ({self.type})"


class Category(models.Model):
    CATEGORY_TYPES = [
        ('income', 'Income'),
        ('expense', 'Expense'),
    ]

    name = models.CharField(max_length=100)
    type = models.CharField(max_length=7, choices=CATEGORY_TYPES)
    icon = models.CharField(max_length=50, default='tag')
    color = models.CharField(max_length=7, default='#6366f1')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='categories', null=True, blank=True
    )
    is_default = models.BooleanField(default=False)
    keywords = models.TextField(
        blank=True, default='',
        help_text='Comma-separated keywords for auto-categorization'
    )

    class Meta:
        db_table = 'categories'
        verbose_name_plural = 'categories'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.type})"


class Transaction(models.Model):
    TRANSACTION_TYPES = [
        ('income', 'Income'),
        ('expense', 'Expense'),
    ]
    TAX_SECTIONS = [
        ('80C', '80C'),
        ('80D', '80D'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='transactions'
    )
    type = models.CharField(max_length=7, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL,
        null=True, related_name='transactions'
    )
    account = models.ForeignKey(
        Account, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='transactions'
    )
    date = models.DateField()
    notes = models.TextField(blank=True, default='')
    merchant = models.CharField(max_length=200, blank=True, default='')
    location_name = models.CharField(max_length=255, blank=True, default='')
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    tax_section = models.CharField(max_length=10, choices=TAX_SECTIONS, blank=True, default='')
    is_subscription = models.BooleanField(default=False)
    auto_categorized = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'transactions'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['user', '-date'], name='tx_user_date_idx'),
            models.Index(fields=['user', 'type', 'date'], name='tx_user_type_date_idx'),
            models.Index(fields=['user', 'category', 'date'], name='tx_user_cat_date_idx'),
            models.Index(fields=['user', 'tax_section', 'date'], name='tx_user_tax_date_idx'),
        ]

    def __str__(self):
        return f"{self.type}: {self.amount} on {self.date}"


class Subscription(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='subscriptions'
    )
    name = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='subscriptions'
    )
    frequency = models.CharField(max_length=20, default='monthly',
                                 choices=[('weekly', 'Weekly'), ('monthly', 'Monthly'), ('yearly', 'Yearly')])
    is_active = models.BooleanField(default=True)
    detected_auto = models.BooleanField(default=False)
    next_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'subscriptions'
        ordering = ['name']

    def __str__(self):
        return f"{self.name}: ₹{self.amount}/{self.frequency}"


class Budget(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='budgets'
    )
    category = models.ForeignKey(
        Category, on_delete=models.CASCADE,
        related_name='budgets'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    month = models.IntegerField()
    year = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'budgets'
        unique_together = ['user', 'category', 'month', 'year']
        ordering = ['-year', '-month']

    def __str__(self):
        return f"Budget: {self.category.name} - {self.amount} ({self.month}/{self.year})"


class SavingsGoal(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='savings_goals'
    )
    name = models.CharField(max_length=200)
    target_amount = models.DecimalField(max_digits=12, decimal_places=2)
    current_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    deadline = models.DateField(null=True, blank=True)
    icon = models.CharField(max_length=50, default='piggy-bank')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'savings_goals'
        ordering = ['deadline']

    def __str__(self):
        return f"{self.name}: {self.current_amount}/{self.target_amount}"

    @property
    def progress(self):
        if self.target_amount == 0:
            return 0
        return round(float(self.current_amount) / float(self.target_amount) * 100, 1)


class GoalContribution(models.Model):
    goal = models.ForeignKey(
        SavingsGoal, on_delete=models.CASCADE,
        related_name='contributions'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    account = models.ForeignKey(
        Account, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='goal_contributions'
    )
    transaction = models.ForeignKey(
        Transaction, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='goal_contributions'
    )
    notes = models.CharField(max_length=200, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'goal_contributions'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.goal.name}: +₹{self.amount}"
