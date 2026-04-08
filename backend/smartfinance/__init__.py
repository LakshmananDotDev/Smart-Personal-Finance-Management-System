import pymysql

# Django's MySQL backend checks mysqlclient version metadata.
# PyMySQL is fully compatible but reports a different version string,
# so we align it with the expected mysqlclient floor.
pymysql.version_info = (2, 2, 1, 'final', 0)
pymysql.__version__ = '2.2.1'

pymysql.install_as_MySQLdb()

try:
	from .celery import app as celery_app
except Exception:  # pragma: no cover - defensive fallback for local envs
	celery_app = None

__all__ = ('celery_app',)
