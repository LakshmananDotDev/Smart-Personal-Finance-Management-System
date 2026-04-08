"""
Receipt Scanner — OCR-based receipt processing.
Extracts amount, date, and merchant from uploaded receipt images.
Uses Tesseract OCR (pytesseract) if available, falls back to regex parsing.
"""

import re
from datetime import datetime, date


def extract_from_text(text):
    """
    Extract transaction details from OCR or user-pasted receipt text.
    Returns dict with amount, date, merchant, and raw text.
    """
    result = {
        'amount': None,
        'date': None,
        'merchant': None,
        'raw_text': text,
        'confidence': 0,
    }

    if not text:
        return result

    lines = text.strip().split('\n')

    # Extract amount — look for currency patterns
    amount_patterns = [
        r'(?:total|amount|grand\s*total|net\s*amount|payable)[:\s]*[₹$]?\s*([\d,]+\.?\d*)',
        r'[₹$]\s*([\d,]+\.?\d{0,2})',
        r'(?:rs\.?|inr)\s*([\d,]+\.?\d*)',
        r'([\d,]+\.\d{2})\s*(?:total|paid|amount)',
    ]

    for pattern in amount_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount_str = match.group(1).replace(',', '')
            try:
                result['amount'] = float(amount_str)
                result['confidence'] += 0.3
                break
            except ValueError:
                pass

    # Extract date
    date_patterns = [
        (r'(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})', '%d/%m/%Y'),
        (r'(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})', '%Y/%m/%d'),
        (r'(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})', 'dmy_text'),
        (r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2}),?\s+(\d{4})', 'mdy_text'),
    ]

    months_map = {
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    }

    for pattern, fmt in date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                if fmt == 'dmy_text':
                    d, m_str, y = match.groups()
                    m = months_map.get(m_str[:3].lower(), 0)
                    if m:
                        result['date'] = date(int(y), m, int(d)).isoformat()
                        result['confidence'] += 0.3
                        break
                elif fmt == 'mdy_text':
                    m_str, d, y = match.groups()
                    m = months_map.get(m_str[:3].lower(), 0)
                    if m:
                        result['date'] = date(int(y), m, int(d)).isoformat()
                        result['confidence'] += 0.3
                        break
                else:
                    groups = match.groups()
                    date_str = '/'.join(groups)
                    parsed = datetime.strptime(date_str, fmt.replace('-', '/').replace('.', '/'))
                    result['date'] = parsed.date().isoformat()
                    result['confidence'] += 0.3
                    break
            except (ValueError, IndexError):
                pass

    # Extract merchant — usually the first meaningful line
    for line in lines:
        clean = line.strip()
        if len(clean) > 2 and not re.match(r'^[\d\s/\-:.,$₹%]+$', clean):
            # Skip lines that are purely numbers/dates/symbols
            if not re.match(r'(?:date|time|total|amount|tax|gst|receipt|invoice|bill)', clean, re.IGNORECASE):
                result['merchant'] = clean[:200]
                result['confidence'] += 0.2
                break

    return result


def process_image(image_file):
    """
    Process an uploaded image file using Tesseract OCR.
    Falls back to returning empty result if Tesseract is not installed.
    """
    try:
        from PIL import Image
        import pytesseract

        img = Image.open(image_file)
        text = pytesseract.image_to_string(img)
        return extract_from_text(text)
    except ImportError:
        return {
            'amount': None,
            'date': None,
            'merchant': None,
            'raw_text': '',
            'confidence': 0,
            'error': 'OCR dependencies not installed. Install: pip install pytesseract Pillow. '
                     'Also install Tesseract-OCR system package.',
        }
    except Exception as e:
        return {
            'amount': None,
            'date': None,
            'merchant': None,
            'raw_text': '',
            'confidence': 0,
            'error': str(e),
        }
