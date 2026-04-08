/**
 * Finyx Interactive Product Tour (Shepherd.js)
 * Implements the onboarding walkthrough.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Basic Shepherd Theme Override (added via injected style)
    const style = document.createElement('style');
    style.innerHTML = `
        .shepherd-element {
            background: var(--color-bg-elevated) !important;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5) !important;
            border-radius: var(--radius-lg) !important;
            border: 1px solid var(--color-border) !important;
            font-family: var(--font-base) !important;
            color: var(--color-text) !important;
        }
        .shepherd-header {
            background: transparent !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
            padding: 1rem 1.5rem 0.5rem !important;
        }
        .shepherd-text {
            color: var(--color-text-secondary) !important;
            font-size: 0.95rem !important;
            line-height: 1.6 !important;
            padding: 1rem 1.5rem !important;
        }
        .shepherd-footer {
            background: transparent !important;
            padding: 0 1.5rem 1.5rem !important;
            border-top: none !important;
        }
        .shepherd-arrow:before {
            background: var(--color-bg-elevated) !important;
            border: 1px solid var(--color-border) !important;
        }
        .shepherd-title {
            font-family: var(--font-display) !important;
            font-weight: 600 !important;
            color: var(--color-text) !important;
            font-size: 1.1rem !important;
        }
        .shepherd-cancel-icon {
            color: var(--color-text-muted) !important;
        }
        .shepherd-cancel-icon:hover {
            color: var(--color-text) !important;
        }
        .shepherd-button {
            background: var(--color-primary) !important;
            color: #000 !important;
            border-radius: var(--radius-md) !important;
            font-weight: 600 !important;
            transition: all var(--transition-fast) !important;
            padding: 0.5rem 1.25rem !important;
        }
        .shepherd-button:hover { background: #00e085 !important; }
        .shepherd-button-secondary {
            background: var(--color-bg-card) !important;
            color: var(--color-text) !important;
            border: 1px solid var(--color-border) !important;
        }
        .shepherd-button-secondary:hover { background: var(--color-bg-hover) !important; }
    `;
    document.head.appendChild(style);

    const tour = new Shepherd.Tour({
        defaultStepOptions: {
            cancelIcon: { enabled: true },
            classes: 'shadow-md bg-purple-dark',
            scrollTo: { behavior: 'smooth', block: 'center' }
        },
        useModalOverlay: true
    });

    tour.addSteps([
        {
            id: 'welcome',
            title: 'Welcome to Finyx! 🎉',
            text: 'Welcome to your new AI-powered financial hub. Today, we’ll quickly set up your account so you can start tracking, saving, and getting intelligent insights right away.',
            buttons: [
                { text: 'Skip', action: tour.cancel, classes: 'shepherd-button-secondary' },
                { text: 'Let\'s Go!', action: tour.next }
            ]
        },
        {
            id: 'dashboard-overview',
            title: 'Your Command Center',
            text: 'Observe your "Total Balance". Once you add data, your monthly spending summaries, account balances, and quick stats will populate right here.',
            attachTo: { element: '#totalBalance', on: 'bottom' },
            buttons: [
                { text: 'Back', action: tour.back, classes: 'shepherd-button-secondary' },
                { text: 'Next', action: tour.next }
            ]
        },
        {
            id: 'add-transaction',
            title: 'Log Transactions easily',
            text: 'You can navigate to the Transactions page anytime to log an expense or income quickly. We also sort them for you.',
            attachTo: { element: 'a[href="transactions.html"]', on: 'right' },
            buttons: [
                { text: 'Back', action: tour.back, classes: 'shepherd-button-secondary' },
                { text: 'Next', action: tour.next }
            ]
        },
        {
            id: 'budgets',
            title: 'Set up a Budget',
            text: 'Let’s stop overspending! Pick a category and set a monthly limit here. We’ll alert you if you get close to spending it all.',
            attachTo: { element: 'a[href="budgets.html"]', on: 'right' },
            buttons: [
                { text: 'Back', action: tour.back, classes: 'shepherd-button-secondary' },
                { text: 'Next', action: tour.next }
            ]
        },
        {
            id: 'goals',
            title: 'Create a Savings Goal',
            text: 'Saving for a vacation or emergency fund? Set a target amount and track your progress visually.',
            attachTo: { element: 'a[href="goals.html"]', on: 'right' },
            buttons: [
                { text: 'Back', action: tour.back, classes: 'shepherd-button-secondary' },
                { text: 'Next', action: tour.next }
            ]
        },
        {
            id: 'subscriptions',
            title: 'Auto-detect Subscriptions',
            text: 'Finyx can automatically detect regular payments. Review them here to ensure you aren\'t paying for services you no longer use.',
            attachTo: { element: 'a[href="subscriptions.html"]', on: 'right' },
            buttons: [
                { text: 'Back', action: tour.back, classes: 'shepherd-button-secondary' },
                { text: 'Next', action: tour.next }
            ]
        },
        {
            id: 'reports',
            title: 'Visual Reports',
            text: 'Discover exactly where your money went this year. The interactive doughnut and bar charts make analyzing trends simple.',
            attachTo: { element: 'a[href="reports.html"]', on: 'right' },
            buttons: [
                { text: 'Back', action: tour.back, classes: 'shepherd-button-secondary' },
                { text: 'Next', action: tour.next }
            ]
        },
        {
            id: 'ai-insights',
            title: 'Proprietary AI Insights',
            text: 'This is the magic of Finyx. Our offline AI engine analyzes your habits to flag impulse buying, weekend overspending, and potential savings.',
            attachTo: { element: 'a[href="insights.html"]', on: 'right' },
            buttons: [
                { text: 'Back', action: tour.back, classes: 'shepherd-button-secondary' },
                { text: 'Next', action: tour.next }
            ]
        },
        {
            id: 'health-score',
            title: 'Financial Health Score',
            text: 'Based on your savings rate and budget adherence, this gives you a clear, honest grade (0-100) of your financial wellness.',
            attachTo: { element: 'a[href="health-score.html"]', on: 'right' },
            buttons: [
                { text: 'Back', action: tour.back, classes: 'shepherd-button-secondary' },
                { text: 'Next', action: tour.next }
            ]
        },
        {
            id: 'simulator',
            title: 'What-If Simulator',
            text: 'Wondering what happens if you spend 20% less on dining? Drag the sliders here to instantly forecast your projected savings.',
            attachTo: { element: 'a[href="simulator.html"]', on: 'right' },
            buttons: [
                { text: 'Back', action: tour.back, classes: 'shepherd-button-secondary' },
                { text: 'Next', action: tour.next }
            ]
        },
        {
            id: 'import',
            title: 'Import Bulk Data',
            text: 'Upload bank statements CSVs or use our text-scanner to pull details from receipt text automatically.',
            attachTo: { element: 'a[href="import.html"]', on: 'right' },
            buttons: [
                { text: 'Back', action: tour.back, classes: 'shepherd-button-secondary' },
                { text: 'Next', action: tour.next }
            ]
        },
        {
            id: 'finish',
            title: 'You\'re All Set! 🚀',
            text: 'Congratulations on taking control of your personal finances! Log your expenses to let our AI give you the most accurate money-saving insights.',
            buttons: [
                { text: 'Finish Tour', action: tour.complete }
            ]
        }
    ]);

    // Handle "Take the Tour" button manual click
    const startBtn = document.getElementById('startTourBtn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            tour.start();
        });
    }

    // Auto-start for first time users ONLY (tracked from recent signup/onboarding)
    const hasSeenTour = localStorage.getItem('finyx_tour_completed');
    const justOnboarded = sessionStorage.getItem('finyx_just_onboarded');
    
    if (!hasSeenTour && justOnboarded) {
        setTimeout(() => {
            tour.start();
            sessionStorage.removeItem('finyx_just_onboarded');
        }, 1000);
    }

    // Save completion flag
    tour.on('complete', () => {
        localStorage.setItem('finyx_tour_completed', 'true');
    });
    tour.on('cancel', () => {
        localStorage.setItem('finyx_tour_completed', 'true');
    });
});
