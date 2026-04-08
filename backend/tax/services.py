from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum

from finance.models import Transaction
from insights.categorizer import infer_tax_section


MONEY_PLACES = Decimal('0.01')
CESS_RATE = Decimal('0.04')

CURRENCY_INR_RATE = {
    'INR': Decimal('1.00'),
    'USD': Decimal('83.00'),
    'EUR': Decimal('90.00'),
    'GBP': Decimal('104.00'),
}

CURRENCY_PREFIX = {
    'INR': 'Rs.',
    'USD': '$',
    'EUR': 'EUR ',
    'GBP': 'GBP ',
}

TAX_SECTION_LIMITS = {
    '80C': Decimal('150000.00'),
    '80D': Decimal('25000.00'),
}

TAX_SECTION_LABELS = {
    '80C': 'Section 80C (LIC, PPF, ELSS, etc.)',
    '80D': 'Section 80D (Health Insurance)',
}

OLD_REGIME_SLABS = [
    (250000, Decimal('0.00')),
    (500000, Decimal('0.05')),
    (1000000, Decimal('0.20')),
    (None, Decimal('0.30')),
]

NEW_REGIME_SLABS = [
    (300000, Decimal('0.00')),
    (600000, Decimal('0.05')),
    (900000, Decimal('0.10')),
    (1200000, Decimal('0.15')),
    (1500000, Decimal('0.20')),
    (None, Decimal('0.30')),
]


def _money(value):
    return Decimal(value or 0).quantize(MONEY_PLACES, rounding=ROUND_HALF_UP)


def _money_float(value):
    return float(_money(value))


class TaxOptimizerService:
    def __init__(self, user, year=None):
        self.user = user
        self.year = int(year or date.today().year)
        currency_code = (getattr(user, 'currency', '') or 'INR').upper()
        self.currency_code = currency_code if currency_code in CURRENCY_INR_RATE else 'INR'
        self.currency_to_inr_rate = CURRENCY_INR_RATE[self.currency_code]

    def _year_transactions(self):
        return Transaction.objects.filter(user=self.user, date__year=self.year)

    def _year_income_inr(self):
        total = (
            self._year_transactions()
            .filter(type='income')
            .aggregate(total=Sum('amount'))
            .get('total')
        )
        return self._to_inr(total)

    def _to_inr(self, value):
        return _money(Decimal(value or 0) * self.currency_to_inr_rate)

    def _from_inr(self, value):
        if self.currency_to_inr_rate == 0:
            return _money(value)
        return _money(Decimal(value or 0) / self.currency_to_inr_rate)

    def _display_amount(self, amount_inr):
        converted = self._from_inr(amount_inr)
        prefix = CURRENCY_PREFIX.get(self.currency_code, 'Rs.')
        return f"{prefix}{converted:,.2f}"

    def _detect_tax_section(self, tx):
        if tx.tax_section in TAX_SECTION_LIMITS:
            return tx.tax_section

        parts = [
            tx.notes or '',
            tx.merchant or '',
            tx.location_name or '',
            tx.category.name if tx.category else '',
        ]
        return infer_tax_section(' '.join(parts))

    def _deduction_sections(self):
        aggregates = {
            section: {
                'section': section,
                'label': TAX_SECTION_LABELS[section],
                'limit_inr': limit,
                'contributed_inr': Decimal('0.00'),
                'eligible_deduction_inr': Decimal('0.00'),
                'remaining_limit_inr': limit,
                'utilization_percent': 0.0,
                'transaction_count': 0,
            }
            for section, limit in TAX_SECTION_LIMITS.items()
        }

        expense_qs = self._year_transactions().filter(type='expense').select_related('category')
        for tx in expense_qs:
            section = self._detect_tax_section(tx)
            if section not in aggregates:
                continue

            entry = aggregates[section]
            amount_inr = self._to_inr(tx.amount)
            entry['contributed_inr'] += amount_inr
            entry['transaction_count'] += 1

        for section, entry in aggregates.items():
            limit_inr = entry['limit_inr']
            claimable_inr = min(limit_inr, entry['contributed_inr'])
            entry['eligible_deduction_inr'] = claimable_inr
            entry['remaining_limit_inr'] = max(Decimal('0.00'), limit_inr - claimable_inr)
            entry['utilization_percent'] = (
                round(float((claimable_inr / limit_inr) * Decimal('100.00')), 1)
                if limit_inr > 0
                else 0.0
            )

        return aggregates

    def _progressive_tax(self, taxable_income, slabs):
        income = max(Decimal('0.00'), _money(taxable_income))
        tax = Decimal('0.00')
        lower = Decimal('0.00')

        for upper, rate in slabs:
            if upper is None:
                if income > lower:
                    tax += (income - lower) * rate
                break

            upper_limit = Decimal(str(upper))
            if income > lower:
                slab_income = min(income, upper_limit) - lower
                if slab_income > 0:
                    tax += slab_income * rate

            lower = upper_limit
            if income <= upper_limit:
                break

        return _money(tax)

    def _calc_old_regime(self, annual_income, eligible_deduction):
        taxable_income = max(Decimal('0.00'), _money(annual_income) - _money(eligible_deduction))
        base_tax = self._progressive_tax(taxable_income, OLD_REGIME_SLABS)

        # Rebate under old regime up to taxable income 5L
        if taxable_income <= Decimal('500000.00'):
            base_tax = Decimal('0.00')

        cess = _money(base_tax * CESS_RATE)
        total_tax = _money(base_tax + cess)

        return {
            'taxable_income': _money(taxable_income),
            'base_tax': base_tax,
            'cess': cess,
            'total_tax': total_tax,
        }

    def _calc_new_regime(self, annual_income):
        taxable_income = max(Decimal('0.00'), _money(annual_income))
        base_tax = self._progressive_tax(taxable_income, NEW_REGIME_SLABS)

        # Rebate under new regime up to taxable income 7L
        if taxable_income <= Decimal('700000.00'):
            base_tax = Decimal('0.00')

        cess = _money(base_tax * CESS_RATE)
        total_tax = _money(base_tax + cess)

        return {
            'taxable_income': _money(taxable_income),
            'base_tax': base_tax,
            'cess': cess,
            'total_tax': total_tax,
        }

    def _marginal_old_rate(self, taxable_income):
        income = _money(taxable_income)
        if income > Decimal('1000000.00'):
            return Decimal('0.30')
        if income > Decimal('500000.00'):
            return Decimal('0.20')
        if income > Decimal('250000.00'):
            return Decimal('0.05')
        return Decimal('0.00')

    def _projected_annual_income(self, annual_income):
        income = _money(annual_income)
        today = date.today()

        if self.year != today.year:
            return income, 'actual'

        months_elapsed = max(1, today.month)
        if months_elapsed >= 12:
            return income, 'actual'

        projected = _money((income / Decimal(str(months_elapsed))) * Decimal('12'))
        if projected < income:
            projected = income

        return projected, 'run_rate'

    def _projected_eligible_deduction(self, eligible_deduction):
        deduction = _money(eligible_deduction)
        today = date.today()

        if self.year != today.year:
            return deduction, 'actual'

        months_elapsed = max(1, today.month)
        if months_elapsed >= 12:
            return deduction, 'actual'

        projected = _money((deduction / Decimal(str(months_elapsed))) * Decimal('12'))
        max_limit_inr = sum(TAX_SECTION_LIMITS.values())
        projected = min(projected, max_limit_inr)
        if projected < deduction:
            projected = deduction

        return projected, 'run_rate'

    def _tax_context_inr(self):
        sections = self._deduction_sections()
        tracked_income_inr = self._year_income_inr()
        tracked_eligible_inr = sum(
            section['eligible_deduction_inr'] for section in sections.values()
        )

        projected_income_inr, income_mode = self._projected_annual_income(tracked_income_inr)
        projected_eligible_inr, deduction_mode = self._projected_eligible_deduction(tracked_eligible_inr)

        old_regime = self._calc_old_regime(projected_income_inr, projected_eligible_inr)
        new_regime = self._calc_new_regime(projected_income_inr)

        old_tax_inr = old_regime['total_tax']
        new_tax_inr = new_regime['total_tax']

        if old_tax_inr < new_tax_inr:
            recommended = 'old'
            savings_inr = new_tax_inr - old_tax_inr
        elif new_tax_inr < old_tax_inr:
            recommended = 'new'
            savings_inr = old_tax_inr - new_tax_inr
        else:
            recommended = 'either'
            savings_inr = Decimal('0.00')

        basis = 'projected' if income_mode == 'run_rate' or deduction_mode == 'run_rate' else 'actual'

        return {
            'sections': sections,
            'tracked_income_inr': tracked_income_inr,
            'tracked_eligible_inr': tracked_eligible_inr,
            'projected_income_inr': projected_income_inr,
            'projected_eligible_inr': projected_eligible_inr,
            'old_regime': old_regime,
            'new_regime': new_regime,
            'old_tax_inr': old_tax_inr,
            'new_tax_inr': new_tax_inr,
            'recommended_regime': recommended,
            'savings_inr': savings_inr,
            'comparison_basis': basis,
        }

    def get_summary(self):
        context = self._tax_context_inr()
        sections = context['sections']

        section_list = []
        total_contributed_inr = Decimal('0.00')
        total_eligible_inr = Decimal('0.00')
        total_remaining_inr = Decimal('0.00')

        for key in ['80C', '80D']:
            section = sections[key]
            total_contributed_inr += section['contributed_inr']
            total_eligible_inr += section['eligible_deduction_inr']
            total_remaining_inr += section['remaining_limit_inr']
            section_list.append({
                'section': section['section'],
                'label': section['label'],
                'limit': _money_float(self._from_inr(section['limit_inr'])),
                'contributed': _money_float(self._from_inr(section['contributed_inr'])),
                'eligible_deduction': _money_float(self._from_inr(section['eligible_deduction_inr'])),
                'remaining_limit': _money_float(self._from_inr(section['remaining_limit_inr'])),
                'utilization_percent': section['utilization_percent'],
                'transaction_count': section['transaction_count'],
            })

        return {
            'year': self.year,
            'currency': self.currency_code,
            'annual_income': _money_float(self._from_inr(context['tracked_income_inr'])),
            'total_deductions_contributed': _money_float(self._from_inr(total_contributed_inr)),
            'total_deductions_eligible': _money_float(self._from_inr(total_eligible_inr)),
            'remaining_deduction_capacity': _money_float(self._from_inr(total_remaining_inr)),
            'sections': section_list,
        }

    def get_regime_comparison(self):
        context = self._tax_context_inr()
        old_regime = context['old_regime']
        new_regime = context['new_regime']

        return {
            'year': self.year,
            'currency': self.currency_code,
            'annual_income': _money_float(self._from_inr(context['tracked_income_inr'])),
            'comparison_annual_income': _money_float(self._from_inr(context['projected_income_inr'])),
            'eligible_deductions_old_regime': _money_float(self._from_inr(context['projected_eligible_inr'])),
            'comparison_basis': context['comparison_basis'],
            'old_regime': {
                'taxable_income': _money_float(self._from_inr(old_regime['taxable_income'])),
                'base_tax': _money_float(self._from_inr(old_regime['base_tax'])),
                'cess': _money_float(self._from_inr(old_regime['cess'])),
                'total_tax': _money_float(self._from_inr(context['old_tax_inr'])),
            },
            'new_regime': {
                'taxable_income': _money_float(self._from_inr(new_regime['taxable_income'])),
                'base_tax': _money_float(self._from_inr(new_regime['base_tax'])),
                'cess': _money_float(self._from_inr(new_regime['cess'])),
                'total_tax': _money_float(self._from_inr(context['new_tax_inr'])),
            },
            'tax_difference': _money_float(self._from_inr(context['savings_inr'])),
            'recommended_regime': context['recommended_regime'],
        }

    def get_estimator(self):
        context = self._tax_context_inr()

        if context['old_tax_inr'] < context['new_tax_inr']:
            recommended = 'old'
            estimated_annual_tax_inr = context['old_tax_inr']
        elif context['new_tax_inr'] < context['old_tax_inr']:
            recommended = 'new'
            estimated_annual_tax_inr = context['new_tax_inr']
        else:
            recommended = 'either'
            estimated_annual_tax_inr = min(context['old_tax_inr'], context['new_tax_inr'])

        monthly_tax_inr = _money(estimated_annual_tax_inr / Decimal('12'))

        return {
            'year': self.year,
            'currency': self.currency_code,
            'annual_income': _money_float(self._from_inr(context['tracked_income_inr'])),
            'projected_annual_income': _money_float(self._from_inr(context['projected_income_inr'])),
            'projected_eligible_deductions_old_regime': _money_float(self._from_inr(context['projected_eligible_inr'])),
            'estimation_basis': context['comparison_basis'],
            'estimated_annual_tax': _money_float(self._from_inr(estimated_annual_tax_inr)),
            'monthly_tax_liability': _money_float(self._from_inr(monthly_tax_inr)),
            'recommended_regime': recommended,
            'old_regime_tax': _money_float(self._from_inr(context['old_tax_inr'])),
            'new_regime_tax': _money_float(self._from_inr(context['new_tax_inr'])),
        }

    def get_suggestions(self):
        context = self._tax_context_inr()
        annual_income_inr = context['tracked_income_inr']
        marginal_rate = self._marginal_old_rate(context['old_regime']['taxable_income'])
        sections = context['sections']

        suggestions = []

        if sections.get('80C') and sections['80C']['remaining_limit_inr'] > 0:
            used_inr = sections['80C']['eligible_deduction_inr']
            remaining_inr = sections['80C']['remaining_limit_inr']
            potential_save_inr = _money(remaining_inr * marginal_rate * (Decimal('1.00') + CESS_RATE))
            suggestions.append({
                'type': 'info',
                'priority': 'high',
                'title': 'Increase 80C investments',
                'message': (
                    f"You have used {self._display_amount(used_inr)} of 80C. "
                    f"Invest up to {self._display_amount(remaining_inr)} more to maximize this section. "
                    f"Estimated tax saving potential: {self._display_amount(potential_save_inr)}."
                ),
                'section': '80C',
            })

        if sections.get('80D') and sections['80D']['remaining_limit_inr'] > 0:
            remaining_inr = sections['80D']['remaining_limit_inr']
            potential_save_inr = _money(remaining_inr * marginal_rate * (Decimal('1.00') + CESS_RATE))
            suggestions.append({
                'type': 'warning',
                'priority': 'medium',
                'title': 'Use remaining 80D health cover deduction',
                'message': (
                    f"Your 80D utilization is {sections['80D']['utilization_percent']}%. "
                    f"You can still claim {self._display_amount(remaining_inr)} through eligible health insurance premiums. "
                    f"Estimated tax saving potential: {self._display_amount(potential_save_inr)}."
                ),
                'section': '80D',
            })

        if context['recommended_regime'] == 'old' and context['savings_inr'] > 0:
            suggestions.append({
                'type': 'success',
                'priority': 'high',
                'title': 'Old regime is currently better',
                'message': (
                    f"Based on your current deductions, old regime can reduce tax by "
                    f"{self._display_amount(context['savings_inr'])} for FY {self.year}."
                ),
                'section': 'comparison',
            })
        elif context['recommended_regime'] == 'new' and context['savings_inr'] > 0:
            suggestions.append({
                'type': 'info',
                'priority': 'medium',
                'title': 'New regime is currently better',
                'message': (
                    f"Your current deduction utilization is relatively low. "
                    f"New regime reduces tax by {self._display_amount(context['savings_inr'])} right now."
                ),
                'section': 'comparison',
            })

        if annual_income_inr <= Decimal('0.00'):
            suggestions = [{
                'type': 'info',
                'priority': 'low',
                'title': 'Add income transactions for tax estimation',
                'message': 'Tax estimates become more accurate once salary/freelance income entries are tracked regularly.',
                'section': 'data-quality',
            }]

        if not suggestions:
            suggestions.append({
                'type': 'success',
                'priority': 'low',
                'title': 'Tax profile looks optimized',
                'message': 'Your current deduction utilization and regime choice look balanced for this financial year.',
                'section': 'overall',
            })

        return suggestions
