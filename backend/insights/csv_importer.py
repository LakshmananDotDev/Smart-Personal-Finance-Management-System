"""
CSV / Bank Statement Import Service.
Parses CSV files and creates transaction records.
"""

import csv
import io
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from finance.models import Transaction, Category
from insights.categorizer import auto_categorize


# Common column name mappings
COLUMN_ALIASES = {
    'date': ['date', 'transaction date', 'txn date', 'posting date', 'value date', 'trans date'],
    'amount': ['amount', 'transaction amount', 'txn amount', 'debit', 'credit', 'value', 'sum'],
    'description': ['description', 'narration', 'particulars', 'details', 'memo', 'notes',
                     'transaction details', 'merchant', 'payee', 'name'],
    'type': ['type', 'transaction type', 'dr/cr', 'debit/credit'],
    'debit': ['debit', 'debit amount', 'withdrawal', 'dr'],
    'credit': ['credit', 'credit amount', 'deposit', 'cr'],
}


def _normalize_header(header):
    """Normalize a header string for matching."""
    return header.strip().lower().replace('_', ' ')


def _match_column(header, field):
    """Check if a header matches a known field."""
    normalized = _normalize_header(header)
    return normalized in COLUMN_ALIASES.get(field, [])


def _parse_date(value):
    """Try multiple date formats."""
    formats = [
        '%Y-%m-%d', '%d-%m-%Y', '%m-%d-%Y',
        '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d',
        '%d-%b-%Y', '%d %b %Y', '%b %d, %Y',
        '%d.%m.%Y', '%Y.%m.%d',
    ]
    value = value.strip()
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(value):
    """Parse amount string, handling commas and currency symbols."""
    if not value:
        return None
    cleaned = value.strip().replace(',', '').replace('₹', '').replace('$', '').replace(' ', '')
    # Handle parenthetical negatives: (500) = -500
    if cleaned.startswith('(') and cleaned.endswith(')'):
        cleaned = '-' + cleaned[1:-1]
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def preview_csv(file_content, encoding='utf-8'):
    """
    Parse CSV and return preview data with column mapping suggestions.
    Returns first 10 rows + detected column mapping.
    """
    try:
        text = file_content.decode(encoding) if isinstance(file_content, bytes) else file_content
    except UnicodeDecodeError:
        text = file_content.decode('latin-1') if isinstance(file_content, bytes) else file_content

    reader = csv.reader(io.StringIO(text))
    rows = list(reader)

    if len(rows) < 2:
        return {'error': 'CSV must have a header row and at least one data row.'}

    headers = rows[0]
    data_rows = rows[1:11]  # First 10 data rows

    # Auto-detect column mapping
    mapping = {}
    for i, header in enumerate(headers):
        for field in COLUMN_ALIASES:
            if _match_column(header, field):
                mapping[field] = i
                break

    return {
        'headers': headers,
        'mapping': mapping,
        'preview': data_rows,
        'total_rows': len(rows) - 1,
    }


def import_csv(file_content, user, column_mapping=None, encoding='utf-8'):
    """
    Import transactions from CSV content.

    column_mapping: dict mapping field names to column indices
        e.g., {'date': 0, 'amount': 3, 'description': 1}
    """
    try:
        text = file_content.decode(encoding) if isinstance(file_content, bytes) else file_content
    except UnicodeDecodeError:
        text = file_content.decode('latin-1') if isinstance(file_content, bytes) else file_content

    reader = csv.reader(io.StringIO(text))
    rows = list(reader)

    if len(rows) < 2:
        return {'error': 'CSV must have a header row and at least one data row.', 'imported': 0}

    headers = rows[0]

    # Use provided mapping or auto-detect
    if not column_mapping:
        mapping = {}
        for i, header in enumerate(headers):
            for field in COLUMN_ALIASES:
                if _match_column(header, field):
                    mapping[field] = i
                    break
    else:
        mapping = {k: int(v) for k, v in column_mapping.items()}

    if 'date' not in mapping:
        return {'error': 'Date column not found. Please specify column mapping.', 'imported': 0}

    if 'amount' not in mapping and 'debit' not in mapping and 'credit' not in mapping:
        return {'error': 'Amount column not found. Please specify column mapping.', 'imported': 0}

    imported = 0
    errors = []
    created_transactions = []

    for row_num, row in enumerate(rows[1:], start=2):
        try:
            if len(row) < max(mapping.values()) + 1:
                errors.append(f'Row {row_num}: Not enough columns')
                continue

            # Parse date
            date_val = _parse_date(row[mapping['date']])
            if not date_val:
                errors.append(f'Row {row_num}: Invalid date "{row[mapping["date"]]}"')
                continue

            # Parse amount and determine type
            tx_type = 'expense'
            amount = None

            if 'debit' in mapping and 'credit' in mapping:
                debit = _parse_amount(row[mapping['debit']])
                credit = _parse_amount(row[mapping['credit']])
                if credit and float(credit) > 0:
                    amount = credit
                    tx_type = 'income'
                elif debit and float(debit) > 0:
                    amount = debit
                    tx_type = 'expense'
            elif 'amount' in mapping:
                amount = _parse_amount(row[mapping['amount']])
                if amount and amount < 0:
                    amount = abs(amount)
                    tx_type = 'expense'
                elif amount:
                    # Check type column if available
                    if 'type' in mapping:
                        type_val = row[mapping['type']].strip().lower()
                        if type_val in ('cr', 'credit', 'income', 'c'):
                            tx_type = 'income'

            if not amount or amount <= 0:
                errors.append(f'Row {row_num}: Invalid amount')
                continue

            # Description / notes
            desc = ''
            if 'description' in mapping:
                desc = row[mapping['description']].strip()

            # Auto-categorize based on description
            category = None
            auto_cat = False
            cat_result = auto_categorize(desc, user)
            if cat_result:
                category_id = cat_result['category_id']
                try:
                    category = Category.objects.get(id=category_id)
                    auto_cat = True
                except Category.DoesNotExist:
                    pass

            tx = Transaction.objects.create(
                user=user,
                type=tx_type,
                amount=amount,
                category=category,
                date=date_val,
                notes=desc[:500],
                merchant=desc[:200],
                auto_categorized=auto_cat,
            )

            created_transactions.append(tx.id)
            imported += 1

        except Exception as e:
            errors.append(f'Row {row_num}: {str(e)}')

    return {
        'imported': imported,
        'total_rows': len(rows) - 1,
        'errors': errors[:20],  # Cap errors shown
        'error_count': len(errors),
        'transaction_ids': created_transactions[:20],
    }
