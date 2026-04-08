from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return response

    detail = response.data.get('detail') if isinstance(response.data, dict) else None
    message = detail or 'Request failed.'

    response.data = {
        'error': True,
        'code': response.status_code,
        'message': message,
        'details': response.data,
    }
    return response
