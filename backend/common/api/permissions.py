from rest_framework.permissions import BasePermission


class IsAdminRole(BasePermission):
    message = 'Admin role required.'

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        return bool(
            user
            and user.is_authenticated
            and (getattr(user, 'role', 'member') == 'admin' or getattr(user, 'is_superuser', False))
        )
