$ErrorActionPreference = 'Stop'

$outputPath = Join-Path (Get-Location) 'NextGen_Smart_Finance_Presentation_Script.docx'

$word = $null
$doc = $null
$selection = $null

function Add-Paragraph {
    param(
        [string]$Text,
        [string]$Style = 'Normal'
    )

    $script:selection.Style = $Style
    $script:selection.TypeText($Text)
    $script:selection.TypeParagraph()
}

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    $doc = $word.Documents.Add()
    $selection = $word.Selection

    # Baseline typography and spacing
    $normalStyle = $doc.Styles.Item('Normal')
    $normalStyle.Font.Name = 'Calibri'
    $normalStyle.Font.Size = 11
    $normalStyle.ParagraphFormat.SpaceAfter = 8
    $normalStyle.ParagraphFormat.SpaceBefore = 0
    $normalStyle.ParagraphFormat.LineSpacingRule = 5
    $normalStyle.ParagraphFormat.LineSpacing = 13.8

    $titleStyle = $doc.Styles.Item('Title')
    $titleStyle.Font.Name = 'Calibri Light'
    $titleStyle.Font.Size = 28
    $titleStyle.Font.Bold = $true
    $titleStyle.ParagraphFormat.Alignment = 1
    $titleStyle.ParagraphFormat.SpaceAfter = 14

    $subtitleStyle = $doc.Styles.Item('Subtitle')
    $subtitleStyle.Font.Name = 'Calibri'
    $subtitleStyle.Font.Size = 12
    $subtitleStyle.Font.Italic = $true
    $subtitleStyle.ParagraphFormat.Alignment = 1
    $subtitleStyle.ParagraphFormat.SpaceAfter = 16

    $h1 = $doc.Styles.Item('Heading 1')
    $h1.Font.Name = 'Calibri'
    $h1.Font.Size = 16
    $h1.Font.Bold = $true
    $h1.ParagraphFormat.SpaceBefore = 10
    $h1.ParagraphFormat.SpaceAfter = 8

    $h2 = $doc.Styles.Item('Heading 2')
    $h2.Font.Name = 'Calibri'
    $h2.Font.Size = 13
    $h2.Font.Bold = $true
    $h2.ParagraphFormat.SpaceBefore = 8
    $h2.ParagraphFormat.SpaceAfter = 6

    Add-Paragraph 'NEXTGEN SMART FINANCE MANAGER' 'Title'
    Add-Paragraph 'Presentation Script for Dignitaries | 4-Member Team' 'Subtitle'
    Add-Paragraph 'Recommended duration: 12 to 15 minutes' 'Normal'
    Add-Paragraph 'Suggested flow: 4 speakers + live demo + Q&A' 'Normal'
    $selection.TypeParagraph()

    Add-Paragraph 'Presentation Flow at a Glance' 'Heading 1'
    Add-Paragraph 'Member 1 (3 mins): Problem statement, vision, architecture and platform overview.' 'Normal'
    Add-Paragraph 'Member 2 (3 to 4 mins): Core user journey and finance management modules.' 'Normal'
    Add-Paragraph 'Member 3 (3 to 4 mins): AI insights, CSV import, receipt scan and photo extraction.' 'Normal'
    Add-Paragraph 'Member 4 (3 to 4 mins): Tax center, premium model, security, scalability and closing.' 'Normal'
    $selection.TypeParagraph()

    Add-Paragraph 'Speaker 1 Script: Opening, Vision, Architecture (3 minutes)' 'Heading 1'
    Add-Paragraph 'Respected dignitaries, good morning. Thank you for giving us this opportunity.' 'Normal'
    Add-Paragraph 'We are Team [Team Name], and today we present NextGen Smart Finance Manager, an AI-powered personal finance platform built to make daily money decisions simple, secure and actionable.' 'Normal'
    Add-Paragraph 'The core problem we observed is fragmented money management. Users track finances across bank apps, UPI apps, notes and spreadsheets, which leads to missed budgets, unclear spending patterns and poor financial planning.' 'Normal'
    Add-Paragraph 'Our solution is one integrated platform that combines expense tracking, budgeting, savings goals, subscription monitoring, tax support and intelligent recommendations in a single experience.' 'Normal'
    Add-Paragraph 'Technical foundation:' 'Heading 2'
    Add-Paragraph '1. Backend: Django REST Framework' 'Normal'
    Add-Paragraph '2. Frontend: Vanilla HTML, CSS and JavaScript' 'Normal'
    Add-Paragraph '3. Deterministic rule-based intelligence modules for transparent and explainable outputs' 'Normal'
    Add-Paragraph '4. India-first defaults: INR, local merchant coverage, UPI and cash workflows' 'Normal'
    Add-Paragraph '5. Multi-currency user preference support: INR, USD, EUR and GBP' 'Normal'
    Add-Paragraph 'I now invite [Speaker 2 Name] to walk through the end-user journey and core finance modules.' 'Normal'
    $selection.TypeParagraph()

    Add-Paragraph 'Speaker 2 Script: Core User Journey and Finance Features (3 to 4 minutes)' 'Heading 1'
    Add-Paragraph 'Thank you, [Speaker 1 Name]. I will now show how a user moves through the platform from setup to control.' 'Normal'
    Add-Paragraph 'The journey begins with landing page, login or signup, and onboarding where users set profile preferences, monthly income and financial goals.' 'Normal'
    Add-Paragraph 'After onboarding, users enter the Dashboard, which gives quick visibility into income, expenses, trends and alerts.' 'Normal'
    Add-Paragraph 'Core management modules include:' 'Heading 2'
    Add-Paragraph '1. Transactions: full CRUD with filters, merchant details and optional location context' 'Normal'
    Add-Paragraph '2. Accounts: separate tracking for cash, bank, UPI, wallet and credit' 'Normal'
    Add-Paragraph '3. Budgets: category-wise monthly limits with threshold alerts' 'Normal'
    Add-Paragraph '4. Savings Goals: target tracking with contribution progress' 'Normal'
    Add-Paragraph '5. Subscriptions: recurring payment management with detection support' 'Normal'
    Add-Paragraph '6. Reports: monthly and annual analytics with trend and category breakdowns' 'Normal'
    Add-Paragraph 'This gives users one reliable control center instead of multiple disconnected tools.' 'Normal'
    Add-Paragraph 'I now hand over to [Speaker 3 Name] for AI and automation capabilities.' 'Normal'
    $selection.TypeParagraph()

    Add-Paragraph 'Speaker 3 Script: AI, Import, Receipt and Photo Extraction (3 to 4 minutes)' 'Heading 1'
    Add-Paragraph 'Thank you, [Speaker 2 Name]. Our intelligence layer is practical and explainable. It helps users act, not just observe.' 'Normal'
    Add-Paragraph 'Key AI and automation modules:' 'Heading 2'
    Add-Paragraph '1. Auto-categorizer with merchant-keyword rules and user overrides' 'Normal'
    Add-Paragraph '2. Behavioral insights like weekend spikes and payday overspending' 'Normal'
    Add-Paragraph '3. Financial Health Score from 0 to 100 based on savings, adherence and consistency' 'Normal'
    Add-Paragraph '4. What-If Simulator for spending and savings scenario forecasting' 'Normal'
    Add-Paragraph '5. Smart alerts for budget pressure and unusual spending trends' 'Normal'
    Add-Paragraph 'Import and extraction workflow:' 'Heading 2'
    Add-Paragraph '1. CSV import with preview, mapping and validation before saving' 'Normal'
    Add-Paragraph '2. Receipt scanner from pasted bill text' 'Normal'
    Add-Paragraph '3. New photo extraction from bill photos and online bill screenshots' 'Normal'
    Add-Paragraph '4. Extracted fields: amount, date, merchant, suggested category' 'Normal'
    Add-Paragraph '5. One-click Add to Transactions from extracted result' 'Normal'
    Add-Paragraph 'This is especially helpful for users who capture bills as images and want fast entry without manual typing.' 'Normal'
    Add-Paragraph 'I now invite [Speaker 4 Name] to present tax intelligence, security and scale readiness.' 'Normal'
    $selection.TypeParagraph()

    Add-Paragraph 'Speaker 4 Script: Tax, Premium, Security and Closing (3 to 4 minutes)' 'Heading 1'
    Add-Paragraph 'Thank you, [Speaker 3 Name]. I will conclude with trust, monetization and scalability.' 'Normal'
    Add-Paragraph 'Tax Center for Indian users provides:' 'Heading 2'
    Add-Paragraph '1. Deduction tracking under sections 80C and 80D' 'Normal'
    Add-Paragraph '2. Old vs New tax regime comparison' 'Normal'
    Add-Paragraph '3. Tax estimation and liability planning' 'Normal'
    Add-Paragraph '4. Rule-based tax-saving suggestions' 'Normal'
    Add-Paragraph 'Plan model:' 'Heading 2'
    Add-Paragraph '1. Basic plan includes core tracking with practical limits' 'Normal'
    Add-Paragraph '2. Premium unlocks health score, advanced insights, simulator, import automation and tax intelligence' 'Normal'
    Add-Paragraph '3. Entitlements API controls feature gating cleanly' 'Normal'
    Add-Paragraph 'Security and governance:' 'Heading 2'
    Add-Paragraph '1. JWT authentication with access and refresh token lifecycle' 'Normal'
    Add-Paragraph '2. Refresh token rotation and secure logout revocation' 'Normal'
    Add-Paragraph '3. Google OAuth support' 'Normal'
    Add-Paragraph '4. RBAC roles: member, support and admin' 'Normal'
    Add-Paragraph '5. Audit logging for traceability' 'Normal'
    Add-Paragraph 'Scalability path:' 'Heading 2'
    Add-Paragraph '1. Service-selector backend structure for maintainability' 'Normal'
    Add-Paragraph '2. Celery workers for async processing' 'Normal'
    Add-Paragraph '3. Redis cache support for performance and production scaling' 'Normal'
    Add-Paragraph 'Closing statement:' 'Heading 2'
    Add-Paragraph 'NextGen Smart Finance Manager is not only a tracker. It is a complete financial decision platform that combines daily money control, intelligent guidance, tax support and secure engineering in one ecosystem.' 'Normal'
    Add-Paragraph 'Thank you for your time. We are ready to take your questions.' 'Normal'
    $selection.TypeParagraph()

    Add-Paragraph 'Live Demo Cue Sheet (Optional 4 to 5 Minutes)' 'Heading 1'
    Add-Paragraph '1. Speaker 1: Landing page and pricing section' 'Normal'
    Add-Paragraph '2. Speaker 2: Dashboard, transactions, budgets and goals' 'Normal'
    Add-Paragraph '3. Speaker 3: Import Data tab, bill photo extraction, Add to Transactions' 'Normal'
    Add-Paragraph '4. Speaker 4: Tax Center, profile plan status and security summary' 'Normal'
    $selection.TypeParagraph()

    Add-Paragraph 'Hand-Off Lines' 'Heading 1'
    Add-Paragraph 'Speaker 1 to Speaker 2: I now invite [Name] to demonstrate the core user workflow.' 'Normal'
    Add-Paragraph 'Speaker 2 to Speaker 3: I now hand over to [Name] for AI and automation features.' 'Normal'
    Add-Paragraph 'Speaker 3 to Speaker 4: I now invite [Name] to conclude with tax, security and scale readiness.' 'Normal'

    $wdFormatXMLDocument = 12
    $doc.SaveAs([string]$outputPath, [int]$wdFormatXMLDocument)

    Write-Output "DOCX_CREATED=$outputPath"
}
finally {
    if ($doc -ne $null) { $doc.Close($false) }
    if ($word -ne $null) { $word.Quit() }

    if ($selection -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($selection) }
    if ($doc -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) }
    if ($word -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) }

    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
