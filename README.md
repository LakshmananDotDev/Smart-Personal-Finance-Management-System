# NextGen Smart Finance Manager

A production-quality AI-powered personal finance web application with Django REST backend and vanilla HTML/CSS/JS frontend.

## Features

- **Dashboard** — Real-time financial overview with Chart.js visualizations
- **Transactions** — Full CRUD with filtering by type, category, and date range
- **Budgets** — Monthly budget tracking with progress indicators and alerts
- **Savings Goals** — Track savings progress toward custom goals with deadlines
- **Reports** — Yearly financial breakdowns with trend, savings, and category charts
- **AI Insights** — Intelligent spending analysis, budget warnings, velocity tracking, and category comparisons
- **AI Chat Assistant** — In-app finance chatbot with OpenRouter/OpenAI-compatible provider support and local fallback responses
- **Tax Center (India)** — 80C/80D deduction tracking, old vs new regime comparison, real-time tax estimator, and tax-saving suggestions
- **Premium Billing (Razorpay)** — Secure in-app upgrade flow for Premium plans
- **JWT Authentication** — Secure token-based auth with Google OAuth support
- **Dark / Light Mode** — Theme toggle persisted to backend

## Tech Stack

| Layer    | Technology                                        |
| -------- | ------------------------------------------------- |
| Backend  | Django 6.x, Django REST Framework, PyJWT          |
| Frontend | Vanilla HTML, CSS, JavaScript, Chart.js 4         |
| Database | MySQL                                             |
| Auth     | JWT (HS256) + Google OAuth 2.0                    |

## Project Structure

```
├── backend/
│   ├── smartfinance/        # Django project settings & URLs
│   ├── users/               # Custom User model, JWT auth, Google OAuth
│   ├── finance/             # Categories, Transactions, Budgets, SavingsGoals
│   ├── insights/            # AI Insights Engine (7 analysis modules)
│   ├── tax/                 # India tax deduction tracking + regime calculation services
│   ├── manage.py
│   └── .env                 # Environment variables (create this)
│
├── frontend/
│   ├── css/
│   │   ├── base.css         # Design system & components
│   │   ├── landing.css      # Landing page
│   │   ├── auth.css         # Login & signup pages
│   │   └── app.css          # Dashboard & app pages
│   ├── js/
│   │   ├── api.js           # API client (fetch + JWT)
│   │   ├── utils.js         # Shared utilities
│   │   ├── landing.js       # Landing page interactions
│   │   ├── auth.js          # Login & signup logic
│   │   ├── app.js           # Shared app logic (sidebar, theme, auth guard)
│   │   ├── dashboard.js     # Dashboard charts & data
│   │   ├── transactions.js  # Transaction CRUD
│   │   ├── budgets.js       # Budget management
│   │   ├── goals.js         # Savings goal management
│   │   ├── reports.js       # Reports charts
│   │   ├── insights.js      # AI insights display
│   │   └── tax-center.js    # Tax Center dashboard
│   ├── index.html           # Landing page
│   ├── login.html
│   ├── signup.html
│   ├── dashboard.html
│   ├── transactions.html
│   ├── budgets.html
│   ├── goals.html
│   ├── reports.html
│   ├── insights.html
│   └── tax-center.html
```

## Getting Started

### 1. Backend Setup

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install dependencies
pip install django djangorestframework django-cors-headers PyJWT python-dotenv PyMySQL

# Create .env file
copy .env.example .env       # Then edit with your values
```

Edit `backend/.env`:
```
DJANGO_SECRET_KEY=your-django-secret-key-here
JWT_SECRET=your-jwt-secret-key-here
DJANGO_DEBUG=True
DB_NAME=nextgen_smart_finance_manager
DB_USER=root
DB_PASSWORD=your-mysql-password
DB_HOST=127.0.0.1
DB_PORT=3306
GOOGLE_CLIENT_ID=your-google-client-id-here
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
PREMIUM_MONTHLY_PRICE_INR=149
PREMIUM_YEARLY_PRICE_INR=1499

# Chatbot (OpenRouter / OpenAI-compatible)
CHATBOT_PROVIDER=openrouter
CHATBOT_MODEL=openai/gpt-4o-mini
CHATBOT_API_KEY=your-chat-provider-key
CHATBOT_API_ENDPOINT=https://openrouter.ai/api/v1/chat/completions
CHATBOT_TIMEOUT_SECONDS=30
CHATBOT_MAX_TOKENS=350
CHATBOT_MAX_HISTORY=10
CHATBOT_TEMPERATURE=0.4
CHATBOT_FALLBACK_LOCAL=True
CHATBOT_SITE_URL=http://127.0.0.1:5500
CHATBOT_APP_NAME=Finyx
```

> **Generate secrets:** `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`

```bash
# Run migrations
python manage.py makemigrations
python manage.py migrate

# Seed default categories
python manage.py create_defaults

# Start the server
python manage.py runserver
```

Backend runs at **http://127.0.0.1:8000**

### 2. Frontend Setup

Serve the `frontend/` folder on port **5500** (configured in CORS):

**Option A — VS Code Live Server** (recommended):
1. Install the "Live Server" extension in VS Code
2. Right-click `frontend/index.html` → **Open with Live Server**

**Option B — Python HTTP Server**:
```bash
cd frontend
python -m http.server 5500
```

Frontend runs at **http://127.0.0.1:5500**

### 3. Google OAuth (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 Client ID (Web application)
3. Add `http://127.0.0.1:5500` to Authorized JavaScript origins
4. Copy the Client ID to `backend/.env` as `GOOGLE_CLIENT_ID`

## API Endpoints

### Auth
| Method | Endpoint              | Description         |
| ------ | --------------------- | ------------------- |
| POST   | `/api/auth/register/` | Create account      |
| POST   | `/api/auth/login/`    | Login (returns JWT) |
| POST   | `/api/auth/google-login/` | Google OAuth login  |
| GET    | `/api/auth/profile/`  | Get user profile    |
| PATCH  | `/api/auth/profile/`  | Update profile      |
| GET    | `/api/auth/entitlements/` | Plan, limits, and feature access |
| POST   | `/api/auth/premium/create-order/` | Create Razorpay order |
| POST   | `/api/auth/premium/verify/` | Verify payment and activate Premium |

### Finance
| Method | Endpoint                       | Description            |
| ------ | ------------------------------ | ---------------------- |
| GET    | `/api/finance/categories/`     | List categories        |
| GET    | `/api/finance/transactions/`   | List transactions      |
| POST   | `/api/finance/transactions/`   | Create transaction     |
| PUT    | `/api/finance/transactions/:id/` | Update transaction   |
| DELETE | `/api/finance/transactions/:id/` | Delete transaction   |
| GET    | `/api/finance/budgets/`        | List budgets           |
| POST   | `/api/finance/budgets/`        | Create budget          |
| GET    | `/api/finance/savings-goals/`  | List savings goals     |
| POST   | `/api/finance/savings-goals/`  | Create savings goal    |
| GET    | `/api/finance/dashboard/`      | Dashboard summary      |
| GET    | `/api/finance/reports/`        | Yearly reports         |

### Insights
| Method | Endpoint           | Description             |
| ------ | ------------------ | ----------------------- |
| GET    | `/api/insights/`   | AI-generated insights   |
| POST   | `/api/insights/chatbot/` | User chatbot reply (authenticated) |

### Tax
| Method | Endpoint                        | Description                                      |
| ------ | ------------------------------- | ------------------------------------------------ |
| GET    | `/api/tax/summary/`             | Section-wise deduction tracker + remaining limit |
| GET    | `/api/tax/regime-comparison/`   | Old vs new regime tax payable comparison         |
| GET    | `/api/tax/estimator/`           | Estimated annual tax + monthly liability         |
| GET    | `/api/tax/suggestions/`         | Actionable tax-saving recommendations            |

## Default Categories

The app ships with 16 pre-seeded categories across income and expense types:

**Income:** Salary, Freelance, Investments, Other Income  
**Expense:** Food & Dining, Transportation, Shopping, Entertainment, Bills & Utilities, Healthcare, Education, Travel, Groceries, Rent & Housing, Insurance, Personal Care

## AI Insights Engine

The insights module analyzes your financial data and generates actionable feedback:

1. **Spending Trends** — Month-over-month spending comparison
2. **Budget Warnings** — Alerts when approaching or exceeding budgets
3. **Category Comparison** — Current vs 3-month average per category
4. **Savings Analysis** — Monthly savings rate tracking
5. **Spending Velocity** — Projects end-of-month spending trajectory
6. **Top Categories** — Highlights biggest expense categories
7. **Income Analysis** — Income trend monitoring
8. **Tax Optimization** — Detects 80C/80D opportunities and regime advantage

## India Tax Insights Module

The Tax Center is a rule-based tax optimization module for Indian users.

### Supported Deduction Sections

- **80C** — LIC, PPF, ELSS, and related eligible instruments (limit: `Rs.150000`)
- **80D** — Health insurance premium (limit: `Rs.25000`)

### What It Does

1. Auto-tags transactions into tax sections (`80C`, `80D`) using keyword rules.
2. Tracks section utilization, eligible deduction, and remaining deduction room.
3. Compares old and new regime tax using annual income inferred from transaction data.
4. Recommends better regime and provides tax-saving suggestions.
5. Adds tax optimization details to the exported PDF report.

### Usage Examples

```bash
# Tax deduction summary for current year
GET /api/tax/summary/

# Compare regimes for a specific year
GET /api/tax/regime-comparison/?year=2026

# Estimated annual and monthly tax liability
GET /api/tax/estimator/?year=2026

# Suggestions based on unused deduction limits
GET /api/tax/suggestions/?year=2026
```

### Notes

- Tax logic is intentionally rule-based and local to the backend (`backend/tax/services.py`).
- New regime is computed without deductions, old regime uses tracked eligible deductions.
- This module is for planning/optimization and should be cross-verified before filing.
