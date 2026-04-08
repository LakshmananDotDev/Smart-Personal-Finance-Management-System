from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0005_transaction_location_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='transaction',
            name='tax_section',
            field=models.CharField(
                blank=True,
                choices=[('80C', '80C'), ('80D', '80D')],
                default='',
                max_length=10,
            ),
        ),
    ]
