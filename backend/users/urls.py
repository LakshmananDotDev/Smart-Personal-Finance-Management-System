from django.urls import path
from users import views

urlpatterns = [
    path('register/', views.register, name='register'),
    path('login/', views.login, name='login'),
    path('admin/login/', views.admin_login, name='admin-login'),
    path('signup/request-otp/', views.request_signup_email_otp, name='request-signup-email-otp'),
    path('signup/verify-otp/', views.verify_signup_email_otp, name='verify-signup-email-otp'),
    path('refresh/', views.refresh_access_token, name='refresh-access-token'),
    path('logout/', views.logout, name='logout'),
    path('google-login/', views.google_login, name='google-login'),
    path('profile/', views.profile, name='profile'),
    path('entitlements/', views.entitlements, name='entitlements'),
    path('premium/create-order/', views.premium_create_order, name='premium-create-order'),
    path('premium/verify/', views.premium_verify_payment, name='premium-verify-payment'),
    path('admin/overview/', views.admin_overview, name='admin-overview'),
    path('admin/users/', views.admin_users, name='admin-users'),
    path('admin/users/<int:user_id>/', views.admin_user_update, name='admin-user-update'),
    path('admin/audit-logs/', views.admin_audit_logs, name='admin-audit-logs'),
    path('change-password/', views.change_password, name='change-password'),
    path('set-password/', views.set_password, name='set-password'),
]
