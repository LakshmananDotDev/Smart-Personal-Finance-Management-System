from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0006_transaction_tax_section'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['user', '-date'], name='tx_user_date_idx'),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['user', 'type', 'date'], name='tx_user_type_date_idx'),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['user', 'category', 'date'], name='tx_user_cat_date_idx'),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['user', 'tax_section', 'date'], name='tx_user_tax_date_idx'),
        ),
    ]
