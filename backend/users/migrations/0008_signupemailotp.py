from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_user_phone_and_loginotp'),
    ]

    operations = [
        migrations.CreateModel(
            name='SignupEmailOTP',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(db_index=True, max_length=254)),
                ('otp_hash', models.CharField(max_length=64)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('attempts', models.PositiveSmallIntegerField(default=0)),
                ('consumed_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={
                'db_table': 'signup_email_otps',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['email', 'created_at'], name='signup_emai_email_6168d2_idx'),
                    models.Index(fields=['email', 'expires_at'], name='signup_emai_email_2ece97_idx'),
                ],
            },
        ),
    ]
