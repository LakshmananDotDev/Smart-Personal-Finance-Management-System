from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0006_user_role_refreshtoken_auditlog'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='phone_number',
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True, unique=True),
        ),
        migrations.CreateModel(
            name='LoginOTP',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('phone_number', models.CharField(db_index=True, max_length=20)),
                ('purpose', models.CharField(choices=[('login', 'Login')], db_index=True, default='login', max_length=20)),
                ('otp_hash', models.CharField(max_length=64)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('attempts', models.PositiveSmallIntegerField(default=0)),
                ('consumed_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='login_otps', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'login_otps',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['phone_number', 'purpose', 'created_at'], name='login_otps_phone_n_d7b2da_idx'),
                    models.Index(fields=['user', 'purpose', 'expires_at'], name='login_otps_user_id_7b9c47_idx'),
                ],
            },
        ),
    ]
