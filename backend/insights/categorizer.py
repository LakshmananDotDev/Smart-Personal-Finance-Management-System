"""
Smart Auto-Categorization Service.
Uses rule-based keyword matching to automatically categorize transactions.
"""

from django.db.models import Q
from finance.models import Category


# Default keyword mappings for common expense categories
DEFAULT_KEYWORDS = {
    'Food & Dining': [
        'swiggy', 'zomato', 'restaurant', 'cafe', 'pizza', 'burger',
        'food', 'dining', 'eat', 'lunch', 'dinner', 'breakfast',
        'dominos', 'mcdonalds', 'kfc', 'starbucks', 'tea', 'coffee',
        'biryani', 'hotel', 'mess', 'canteen', 'bakery', 'snack',
    ],
    'Transportation': [
        'uber', 'ola', 'rapido', 'metro', 'bus', 'train', 'cab',
        'taxi', 'petrol', 'diesel', 'fuel', 'parking', 'toll',
        'auto', 'rickshaw', 'flight', 'airline', 'irctc',
    ],
    'Shopping': [
        'amazon', 'flipkart', 'myntra', 'ajio', 'shopping', 'mall',
        'store', 'clothes', 'shoes', 'electronics', 'gadget',
        'meesho', 'nykaa', 'reliance', 'dmart',
    ],
    'Entertainment': [
        'netflix', 'spotify', 'hotstar', 'prime', 'movie', 'cinema',
        'game', 'gaming', 'concert', 'event', 'ticket', 'jiocinema',
        'youtube', 'subscription', 'disney',
    ],
    'Bills & Utilities': [
        'electricity', 'water', 'gas', 'internet', 'wifi', 'broadband',
        'phone', 'mobile', 'recharge', 'bill', 'airtel', 'jio',
        'vodafone', 'postpaid', 'prepaid', 'dth',
    ],
    'Healthcare': [
        'hospital', 'doctor', 'medicine', 'pharmacy', 'medical',
        'health', 'clinic', 'dental', 'apollo', 'medplus',
        'lab', 'test', 'diagnosis', 'insurance',
    ],
    'Education': [
        'school', 'college', 'university', 'course', 'udemy',
        'coursera', 'book', 'tuition', 'class', 'exam', 'study',
        'education', 'training', 'coaching',
    ],
    'Groceries': [
        'grocery', 'groceries', 'vegetable', 'fruit', 'milk',
        'bigbasket', 'blinkit', 'zepto', 'instamart', 'supermarket',
        'provision', 'ration', 'kirana',
    ],
    'Rent & Housing': [
        'rent', 'housing', 'maintenance', 'society', 'lease',
        'landlord', 'apartment', 'flat',
    ],
    'Travel': [
        'travel', 'trip', 'vacation', 'holiday', 'booking',
        'makemytrip', 'goibibo', 'oyo', 'airbnb',
    ],
    'Personal Care': [
        'salon', 'haircut', 'spa', 'grooming', 'beauty',
        'cosmetic', 'skincare', 'gym', 'fitness',
    ],
    'Insurance': [
        'insurance', 'lic', 'premium', 'policy', 'term plan',
        'health insurance', 'life insurance',
    ],
    'Salary': [
        'salary', 'payroll', 'wages', 'stipend', 'bonus',
    ],
    'Freelance': [
        'freelance', 'consulting', 'project payment', 'gig',
        'contract', 'client payment',
    ],
    'Investments': [
        'investment', 'mutual fund', 'sip', 'stocks', 'share',
        'dividend', 'interest', 'fd', 'fixed deposit', 'returns',
        'zerodha', 'groww', 'upstox',
    ],
}


TAX_DEDUCTION_KEYWORDS = {
    '80C': [
        'lic', 'life insurance', 'ppf', 'public provident fund', 'elss', 'tax saver',
        'ulip', 'nsc', 'national savings certificate', 'sukanya', 'epf', 'provident fund',
        'home loan principal', 'tuition fee',
    ],
    '80D': [
        'health insurance', 'medical insurance', 'mediclaim', 'insurance premium health',
        'family floater', 'critical illness cover',
    ],
}


def auto_categorize(text, user=None):
    """
    Determine the most likely category for a transaction based on description text.

    Returns: {category_id, category_name, confidence} or None
    """
    if not text:
        return None

    text_lower = text.lower().strip()

    # First try user-specific category keywords
    if user:
        user_categories = Category.objects.filter(
            Q(user=user) | Q(is_default=True)
        ).exclude(keywords='')

        for cat in user_categories:
            cat_keywords = [k.strip().lower() for k in cat.keywords.split(',') if k.strip()]
            for keyword in cat_keywords:
                if keyword in text_lower:
                    return {
                        'category_id': cat.id,
                        'category_name': cat.name,
                        'category_type': cat.type,
                        'confidence': 0.9,
                        'matched_keyword': keyword,
                    }

    # Fallback to default keyword mappings
    best_match = None
    best_score = 0

    for cat_name, keywords in DEFAULT_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text_lower:
                # Longer keyword matches are weighted higher
                score = len(keyword)
                if score > best_score:
                    best_score = score
                    best_match = cat_name

    if best_match:
        # Find the actual category in DB
        cat = Category.objects.filter(
            name=best_match, is_default=True
        ).first()

        if not cat and user:
            cat = Category.objects.filter(
                name=best_match, user=user
            ).first()

        if cat:
            return {
                'category_id': cat.id,
                'category_name': cat.name,
                'category_type': cat.type,
                'confidence': min(0.5 + best_score * 0.05, 0.95),
                'matched_keyword': best_match,
            }

    return None


def suggest_categories(text, user=None):
    """
    Return top 3 category suggestions for a given text.
    """
    if not text:
        return []

    text_lower = text.lower().strip()
    matches = []

    for cat_name, keywords in DEFAULT_KEYWORDS.items():
        score = 0
        matched = []
        for keyword in keywords:
            if keyword in text_lower:
                score += len(keyword)
                matched.append(keyword)

        if score > 0:
            cat = Category.objects.filter(name=cat_name, is_default=True).first()
            if cat:
                matches.append({
                    'category_id': cat.id,
                    'category_name': cat.name,
                    'category_type': cat.type,
                    'confidence': min(0.5 + score * 0.05, 0.95),
                    'matched_keywords': matched,
                })

    matches.sort(key=lambda x: x['confidence'], reverse=True)
    return matches[:3]


def infer_tax_section(text):
    """
    Return an India tax deduction section tag based on transaction text.

    Sections supported:
    - 80C: LIC, PPF, ELSS, etc.
    - 80D: Health insurance premium
    """
    if not text:
        return ''

    text_lower = text.lower().strip()
    if not text_lower:
        return ''

    for section, keywords in TAX_DEDUCTION_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text_lower:
                return section

    return ''
