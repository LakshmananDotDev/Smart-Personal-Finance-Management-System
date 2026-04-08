from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_remove_user_language'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='plan',
            field=models.CharField(choices=[('basic', 'Basic'), ('premium', 'Premium')], default='basic', max_length=20),
        ),
        migrations.AddField(
            model_name='user',
            name='premium_expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='razorpay_customer_id',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
    ]
