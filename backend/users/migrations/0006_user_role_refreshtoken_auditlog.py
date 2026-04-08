from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0005_user_plan_and_premium_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='role',
            field=models.CharField(choices=[('member', 'Member'), ('support', 'Support'), ('admin', 'Admin')], db_index=True, default='member', max_length=20),
        ),
        migrations.CreateModel(
            name='RefreshToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token_hash', models.CharField(db_index=True, max_length=64, unique=True)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('revoked_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('replaced_by_hash', models.CharField(blank=True, default='', max_length=64)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='refresh_tokens', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'refresh_tokens',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(db_index=True, max_length=120)),
                ('resource_type', models.CharField(blank=True, default='', max_length=80)),
                ('resource_id', models.CharField(blank=True, default='', max_length=80)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'audit_logs',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['action', 'created_at'], name='audit_logs_action_410ca2_idx'),
                    models.Index(fields=['resource_type', 'resource_id', 'created_at'], name='audit_logs_resourc_3cbd36_idx'),
                ],
            },
        ),
    ]
