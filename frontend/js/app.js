/**
 * Shared app logic - auth guard, sidebar, top bar settings, logout
 */

(function () {
    'use strict';

    var FONT_SIZE_KEY = 'sf_font_size';
    var THEME_KEY = 'sf_theme';
    var FONT_SIZE_DEFAULT = 16;
    var FONT_SIZE_MIN = 14;
    var FONT_SIZE_MAX = 20;
    var SIDEBAR_BUBBLE_MAX = 99;
    var SIDEBAR_SEEN_PREFIX = 'sf_sidebar_seen_';
    var ADMIN_PANEL_PAGE = 'admin.html';
    var ADMIN_ALLOWED_PAGES = {
        'profile.html': true,
        'admin.html': true,
    };
    var BUBBLE_FEATURE_PAGES = {
        'budgets.html': true,
        'subscriptions.html': true,
        'goals.html': true,
        'insights.html': true,
        'tax-center.html': true,
    };
    var CHATBOT_HISTORY_KEY_PREFIX = 'sf_chatbot_history_';
    var CHATBOT_OPEN_KEY_PREFIX = 'sf_chatbot_open_';
    var CHATBOT_UI_HISTORY_LIMIT = 18;
    var CHATBOT_API_HISTORY_LIMIT = 10;
    var CHATBOT_MAX_MESSAGE_CHARS = 600;
    var CHATBOT_WELCOME_MESSAGE = 'Hi, I am your Finyx AI assistant. Ask me about budgets, subscriptions, savings goals, or tax planning.';
    var currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

    function isAdminUser(profile) {
        return !!(profile && (profile.role === 'admin' || profile.is_superuser === true));
    }

    function enforceAdminPageAccess(profile) {
        if (isAdminUser(profile)) {
            if (!ADMIN_ALLOWED_PAGES[currentPage]) {
                window.location.href = 'admin.html';
            }
            return;
        }

        if (currentPage === ADMIN_PANEL_PAGE) {
            window.location.href = 'dashboard.html';
        }
    }

    // Auth guard
    if (!API.isLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }

    // Onboarding guard - redirect first-time users
    var storedUser = API.getUser();
    if (storedUser && !isAdminUser(storedUser) && !storedUser.is_onboarded) {
        window.location.href = 'onboarding.html';
        return;
    }
    if (storedUser) {
        enforceAdminPageAccess(storedUser);
    }

    // Ensure persisted font size is applied on every app page.
    applyStoredFontSizePreference();

    // Create top bar settings controls (theme + font size) across all app pages.
    ensureTopbarSettings();

    // Keep a single source of truth for newly introduced analytics pages.
    ensureTaxCenterNavLink();

    // Keep old sidebar theme row hidden since controls are now in top bar.
    var sidebarThemeToggle = document.getElementById('themeToggle');
    if (sidebarThemeToggle) {
        sidebarThemeToggle.style.display = 'none';
    }

    /* User info in sidebar */
    function getUserPlanTier(user) {
        var profile = user || API.getUser() || {};
        var plan = String(profile.plan || '').toLowerCase();

        if (
            profile.is_premium === true ||
            profile.premium_active === true ||
            profile.is_premium_active === true ||
            plan === 'premium'
        ) {
            return 'premium';
        }

        return 'basic';
    }

    function applyPlanTierUI(user) {
        var tier = getUserPlanTier(user);
        var isPremium = tier === 'premium';
        var sidebarUserEl = document.getElementById('sidebarUser');
        var sidebarInfoEl = sidebarUserEl ? sidebarUserEl.querySelector('.sidebar-user-info') : null;
        var planBadgeEl = sidebarInfoEl ? sidebarInfoEl.querySelector('.sidebar-user-plan') : null;
        var headerRightEl = document.querySelector('.main-header .main-header-right');
        var headerPillEl = document.getElementById('userPlanPill');

        if (sidebarUserEl) {
            sidebarUserEl.classList.remove('tier-basic', 'tier-premium');
            sidebarUserEl.classList.add(isPremium ? 'tier-premium' : 'tier-basic');
        }

        if (!planBadgeEl && sidebarInfoEl) {
            planBadgeEl = document.createElement('span');
            planBadgeEl.className = 'sidebar-user-plan';
            sidebarInfoEl.appendChild(planBadgeEl);
        }

        if (planBadgeEl) {
            planBadgeEl.classList.remove('tier-basic', 'tier-premium');
            planBadgeEl.classList.add(isPremium ? 'tier-premium' : 'tier-basic');
            planBadgeEl.textContent = isPremium ? 'Premium Plan' : 'Basic Plan';
            planBadgeEl.setAttribute('aria-label', isPremium ? 'Current plan: Premium' : 'Current plan: Basic');
        }

        if (!headerPillEl && headerRightEl) {
            headerPillEl = document.createElement('a');
            headerPillEl.id = 'userPlanPill';
            headerPillEl.className = 'user-plan-pill';
            headerPillEl.innerHTML = '<span class="user-plan-pill-dot" aria-hidden="true"></span><span class="user-plan-pill-label"></span>';
            headerRightEl.insertBefore(headerPillEl, headerRightEl.firstChild);
        }

        if (headerPillEl) {
            headerPillEl.classList.remove('tier-basic', 'tier-premium');
            headerPillEl.classList.add(isPremium ? 'tier-premium' : 'tier-basic');
            headerPillEl.href = isPremium ? 'profile.html' : 'index.html#pricing';
            headerPillEl.title = isPremium ? 'Premium plan active' : 'Basic plan active. Upgrade to Premium';
            headerPillEl.setAttribute('aria-label', isPremium ? 'Premium plan active' : 'Basic plan active. Open upgrade options');

            var labelEl = headerPillEl.querySelector('.user-plan-pill-label');
            if (labelEl) {
                labelEl.textContent = isPremium ? 'PREMIUM' : 'BASIC';
            }
        }

        document.body.classList.toggle('is-premium-user', isPremium);
        document.body.classList.toggle('is-basic-user', !isPremium);
    }

    function populateUserInfo() {
        var user = API.getUser();
        if (!user) return;

        var nameEl = document.getElementById('userName');
        var emailEl = document.getElementById('userEmail');
        var avatarEl = document.getElementById('userAvatar');

        if (nameEl) {
            var fullName = ((user.first_name || '') + ' ' + (user.last_name || '')).trim();
            nameEl.textContent = fullName || user.username || 'User';
        }
        if (emailEl) {
            emailEl.textContent = user.email || '';
        }
        if (avatarEl) {
            if (user.avatar) {
                avatarEl.style.backgroundImage = 'url(' + user.avatar + ')';
                avatarEl.textContent = '';
            } else {
                avatarEl.textContent = (user.first_name || user.username || '?')[0].toUpperCase();
            }
        }

        applyPlanTierUI(user);
        ensureAdminNavLink(user);
    }

    function ensureAdminNavLink(user) {
        var sidebarNav = document.querySelector('.sidebar-nav');
        if (!sidebarNav) return;

        var existing = sidebarNav.querySelector('a[href="admin.html"]');
        if (!isAdminUser(user)) {
            if (existing) {
                var existingSection = existing.closest('.sidebar-section');
                existing.remove();
                if (existingSection && existingSection.getAttribute('data-admin-section') === 'true' && !existingSection.querySelector('.sidebar-link')) {
                    existingSection.remove();
                }
            }
            return;
        }

        var allowedLinks = {
            'profile.html': true,
            'admin.html': true,
        };

        var overviewSection = sidebarNav.querySelector('.sidebar-section[data-admin-overview="true"]') || sidebarNav.querySelector('.sidebar-section');
        if (!overviewSection) {
            overviewSection = document.createElement('div');
            overviewSection.className = 'sidebar-section';
            sidebarNav.insertBefore(overviewSection, sidebarNav.firstChild);
        }
        overviewSection.setAttribute('data-admin-overview', 'true');

        var overviewTitle = overviewSection.querySelector('.sidebar-section-title');
        if (!overviewTitle) {
            overviewTitle = document.createElement('div');
            overviewTitle.className = 'sidebar-section-title';
            overviewSection.insertBefore(overviewTitle, overviewSection.firstChild);
        }
        overviewTitle.textContent = 'Overview';

        var profileLink = sidebarNav.querySelector('a[href="profile.html"]');
        if (!profileLink) {
            profileLink = document.createElement('a');
            profileLink.className = 'sidebar-link';
            profileLink.href = 'profile.html';
            profileLink.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Profile';
            overviewSection.appendChild(profileLink);
        }

        if (!existing) {
            var adminSection = sidebarNav.querySelector('.sidebar-section[data-admin-section="true"]');
            if (!adminSection) {
                adminSection = document.createElement('div');
                adminSection.className = 'sidebar-section';
                adminSection.setAttribute('data-admin-section', 'true');

                var title = document.createElement('div');
                title.className = 'sidebar-section-title';
                title.textContent = 'Admin';
                adminSection.appendChild(title);

                sidebarNav.insertBefore(adminSection, sidebarNav.firstChild);
            }

            var link = document.createElement('a');
            link.className = 'sidebar-link';
            link.href = 'admin.html';
            link.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.2 6.5L22 9.3l-5 4.8 1.2 6.8L12 17.9l-6.2 3 1.2-6.8-5-4.8 6.8-.8L12 2z"></path></svg> Admin Panel';
            adminSection.appendChild(link);
            existing = link;
        }

        sidebarNav.querySelectorAll('a.sidebar-link').forEach(function (link) {
            var href = (link.getAttribute('href') || '').trim();
            if (!allowedLinks[href]) {
                link.remove();
            }
        });

        sidebarNav.querySelectorAll('.sidebar-section').forEach(function (section) {
            if (!section.querySelector('a.sidebar-link')) {
                section.remove();
            }
        });

        if (existing) {
            existing.classList.toggle('active', currentPage === ADMIN_PANEL_PAGE);
        }
    }

    window.populateUserInfo = populateUserInfo;
    populateUserInfo();

    /* Make sidebar user area clickable -> profile */
    var sidebarUser = document.getElementById('sidebarUser');
    if (sidebarUser && sidebarUser.tagName !== 'A') {
        sidebarUser.style.cursor = 'pointer';
        sidebarUser.addEventListener('click', function () {
            window.location.href = 'profile.html';
        });
    }

    // Refresh profile from server in background
    API.getProfile().then(function (data) {
        API.setUser(data);
        populateUserInfo();
        enforceAdminPageAccess(data);
    }).catch(function () { });

    /* Active sidebar link */
    var navLinks = document.querySelectorAll('.sidebar-link');
    navLinks.forEach(function (link) {
        if (link.getAttribute('href') === currentPage) {
            link.classList.add('active');
        }
    });

    initSidebarNotificationBubbles();
    initAdaptiveHeader();
    initRevealAnimations();
    initChatbotWidget();

    function userHasPremiumAccess() {
        return getUserPlanTier() === 'premium';
    }

    function initAdaptiveHeader() {
        var header = document.querySelector('.main-header');
        if (!header) return;

        var root = document.documentElement;
        var ticking = false;

        function updateHeaderState() {
            var scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
            var maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
            var progress = maxScroll > 0 ? Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100)) : 0;

            root.style.setProperty('--scroll-progress', progress.toFixed(2));
            header.classList.toggle('scrolled', scrollTop > 8);
            ticking = false;
        }

        function onScrollOrResize() {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(updateHeaderState);
        }

        window.addEventListener('scroll', onScrollOrResize, { passive: true });
        window.addEventListener('resize', onScrollOrResize);
        updateHeaderState();
    }

    function initRevealAnimations() {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }
        if (!(window.IntersectionObserver && document.querySelectorAll)) {
            return;
        }

        var selector = '.page-content .card, .page-content .page-context, .page-content .page-header, .page-content .filters-bar, .page-content .period-tabs, .page-content .insights-view-toggle';
        var candidates = [];

        document.querySelectorAll(selector).forEach(function (el) {
            var className = el.className || '';
            if (/\banimate-/.test(className)) return;
            if (el.classList.contains('ux-reveal')) return;

            el.classList.add('ux-reveal');
            candidates.push(el);
        });

        if (!candidates.length) return;

        var observer = new IntersectionObserver(function (entries, obs) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                obs.unobserve(entry.target);
            });
        }, {
            threshold: 0.12,
            rootMargin: '0px 0px -12% 0px',
        });

        candidates.forEach(function (el) {
            observer.observe(el);
        });
    }

    function initChatbotWidget() {
        if (isAdminUser(API.getUser())) return;
        if (typeof API.chatbotMessage !== 'function') return;
        if (!document.body) return;

        var user = API.getUser() || {};
        var userKey = String(user.id || user.email || user.username || 'member');
        var historyKey = CHATBOT_HISTORY_KEY_PREFIX + userKey;
        var openKey = CHATBOT_OPEN_KEY_PREFIX + userKey;
        var history = loadChatHistory(historyKey);
        var isLoading = false;
        var isOpen = readOpenPreference(openKey);
        var statusTimer = null;
        var typingNode = null;

        if (!history.length) {
            history = [{ role: 'assistant', content: CHATBOT_WELCOME_MESSAGE }];
            saveChatHistory(historyKey, history);
        }

        var shell = document.createElement('section');
        shell.className = 'chatbot-shell';
        shell.innerHTML =
            '<button type="button" class="chatbot-launcher" aria-expanded="false" aria-controls="chatbotPanel">' +
            '<span class="chatbot-launcher-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H7l-4 3v-3a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h14a4 4 0 0 1 4 4z"></path><path d="M8 10h8"></path><path d="M8 14h5"></path></svg></span>' +
            '<span class="chatbot-launcher-label">AI Assistant</span>' +
            '</button>' +
            '<section class="chatbot-panel" id="chatbotPanel" aria-hidden="true" role="dialog" aria-label="Finyx AI Assistant">' +
            '<div class="chatbot-header">' +
            '<div class="chatbot-header-copy"><strong>Finyx AI Assistant</strong><span>Personal guidance for your finances</span></div>' +
            '<div class="chatbot-header-actions">' +
            '<button type="button" class="chatbot-clear" title="Clear chat">Clear</button>' +
            '<button type="button" class="chatbot-close" aria-label="Close assistant" title="Close assistant"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>' +
            '</div>' +
            '</div>' +
            '<div class="chatbot-messages" id="chatbotMessages"></div>' +
            '<div class="chatbot-suggestions">' +
            '<button type="button" class="chatbot-suggestion" data-prompt="How can I reduce my spending this month?">Cut spending</button>' +
            '<button type="button" class="chatbot-suggestion" data-prompt="How much should I save each month for my goals?">Plan savings</button>' +
            '<button type="button" class="chatbot-suggestion" data-prompt="How do I optimize my subscription costs?">Optimize subscriptions</button>' +
            '</div>' +
            '<form class="chatbot-form">' +
            '<textarea class="chatbot-input" rows="1" maxlength="' + CHATBOT_MAX_MESSAGE_CHARS + '" placeholder="Ask about budgets, goals, subscriptions, or taxes..." aria-label="Message Finyx AI"></textarea>' +
            '<button type="submit" class="chatbot-send">Send</button>' +
            '</form>' +
            '<div class="chatbot-status" aria-live="polite"></div>' +
            '</section>';

        document.body.appendChild(shell);

        var launcher = shell.querySelector('.chatbot-launcher');
        var panel = shell.querySelector('.chatbot-panel');
        var closeBtn = shell.querySelector('.chatbot-close');
        var clearBtn = shell.querySelector('.chatbot-clear');
        var messagesEl = shell.querySelector('.chatbot-messages');
        var form = shell.querySelector('.chatbot-form');
        var input = shell.querySelector('.chatbot-input');
        var sendBtn = shell.querySelector('.chatbot-send');
        var statusEl = shell.querySelector('.chatbot-status');
        var suggestionButtons = shell.querySelectorAll('.chatbot-suggestion');

        renderHistory();
        setOpenState(isOpen);
        autoResizeInput();
        updateSendState();

        launcher.addEventListener('click', function () {
            setOpenState(!isOpen);
        });

        closeBtn.addEventListener('click', function () {
            setOpenState(false);
        });

        clearBtn.addEventListener('click', function () {
            history = [{ role: 'assistant', content: CHATBOT_WELCOME_MESSAGE }];
            saveChatHistory(historyKey, history);
            renderHistory();
            setStatus('Conversation cleared.', 2500);
        });

        input.addEventListener('input', function () {
            autoResizeInput();
            updateSendState();
        });

        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (typeof form.requestSubmit === 'function') {
                    form.requestSubmit();
                    return;
                }
                form.dispatchEvent(new Event('submit', { cancelable: true }));
            }
        });

        suggestionButtons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (isLoading) return;
                input.value = btn.getAttribute('data-prompt') || '';
                autoResizeInput();
                updateSendState();
                input.focus();
            });
        });

        form.addEventListener('submit', function (event) {
            event.preventDefault();

            if (isLoading) return;

            var draft = String(input.value || '').trim();
            if (!draft) {
                updateSendState();
                return;
            }

            if (draft.length > CHATBOT_MAX_MESSAGE_CHARS) {
                setStatus('Keep your message under ' + CHATBOT_MAX_MESSAGE_CHARS + ' characters.', 3000);
                return;
            }

            var requestHistory = history
                .filter(function (entry) {
                    return entry && typeof entry.content === 'string' && entry.content.trim() && entry.content !== CHATBOT_WELCOME_MESSAGE;
                })
                .slice(-CHATBOT_API_HISTORY_LIMIT);

            history.push({ role: 'user', content: draft });
            history = history.slice(-CHATBOT_UI_HISTORY_LIMIT);
            saveChatHistory(historyKey, history);
            renderHistory();

            input.value = '';
            autoResizeInput();

            setLoadingState(true);
            setStatus('Finyx AI is thinking...');
            typingNode = createTypingNode();
            messagesEl.appendChild(typingNode);
            scrollMessagesToBottom();

            API.chatbotMessage({
                message: draft,
                history: requestHistory,
            }).then(function (response) {
                if (typingNode && typingNode.parentNode) {
                    typingNode.parentNode.removeChild(typingNode);
                }
                typingNode = null;

                var replyText = response && response.reply ? String(response.reply).trim() : '';
                if (!replyText) {
                    replyText = 'I could not generate a response right now. Please try again in a moment.';
                }

                history.push({ role: 'assistant', content: replyText });
                history = history.slice(-CHATBOT_UI_HISTORY_LIMIT);
                saveChatHistory(historyKey, history);
                renderHistory();

                if (response && response.is_fallback === true) {
                    setStatus('Using a smart local fallback response right now.', 3200);
                    return;
                }

                setStatus('Response ready.', 1800);
            }).catch(function (error) {
                if (typingNode && typingNode.parentNode) {
                    typingNode.parentNode.removeChild(typingNode);
                }
                typingNode = null;

                var errorMessage = (error && (error.error || error.message)) || 'I am having trouble reaching the assistant right now. Please try again shortly.';
                history.push({ role: 'assistant', content: String(errorMessage) });
                history = history.slice(-CHATBOT_UI_HISTORY_LIMIT);
                saveChatHistory(historyKey, history);
                renderHistory();
                setStatus('Connection issue. You can retry in a moment.', 3600);
            }).finally(function () {
                setLoadingState(false);
            });
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && isOpen) {
                setOpenState(false);
            }
        });

        function renderHistory() {
            messagesEl.innerHTML = '';
            history.forEach(function (entry) {
                var normalizedRole = entry.role === 'user' ? 'user' : 'assistant';
                var text = String(entry.content || '').trim();
                if (!text) return;
                messagesEl.appendChild(createMessageNode(normalizedRole, text));
            });
            scrollMessagesToBottom();
        }

        function createMessageNode(role, text) {
            var row = document.createElement('div');
            row.className = 'chatbot-message-row ' + (role === 'user' ? 'from-user' : 'from-assistant');

            var bubble = document.createElement('div');
            bubble.className = 'chatbot-message';
            bubble.textContent = text;

            row.appendChild(bubble);
            return row;
        }

        function createTypingNode() {
            var row = document.createElement('div');
            row.className = 'chatbot-message-row from-assistant chatbot-typing-row';
            row.innerHTML = '<div class="chatbot-message chatbot-typing"><span></span><span></span><span></span></div>';
            return row;
        }

        function scrollMessagesToBottom() {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        function setOpenState(nextState) {
            isOpen = !!nextState;
            shell.classList.toggle('open', isOpen);
            launcher.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
            persistOpenPreference(openKey, isOpen);

            if (isOpen) {
                window.setTimeout(function () {
                    input.focus();
                    scrollMessagesToBottom();
                }, 150);
            }
        }

        function setLoadingState(nextState) {
            isLoading = !!nextState;
            shell.classList.toggle('is-loading', isLoading);
            input.disabled = isLoading;
            updateSendState();
        }

        function updateSendState() {
            var hasDraft = String(input.value || '').trim().length > 0;
            sendBtn.disabled = isLoading || !hasDraft;
        }

        function autoResizeInput() {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 110) + 'px';
        }

        function setStatus(message, clearDelay) {
            if (statusTimer) {
                window.clearTimeout(statusTimer);
                statusTimer = null;
            }

            statusEl.textContent = message || '';

            if (message && clearDelay) {
                statusTimer = window.setTimeout(function () {
                    statusEl.textContent = '';
                }, clearDelay);
            }
        }
    }

    function loadChatHistory(key) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return [];

            var parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];

            return parsed
                .filter(function (entry) {
                    if (!entry || typeof entry !== 'object') return false;
                    if (entry.role !== 'user' && entry.role !== 'assistant') return false;
                    return typeof entry.content === 'string' && entry.content.trim().length > 0;
                })
                .slice(-CHATBOT_UI_HISTORY_LIMIT);
        } catch (_) {
            return [];
        }
    }

    function saveChatHistory(key, history) {
        try {
            localStorage.setItem(key, JSON.stringify(history.slice(-CHATBOT_UI_HISTORY_LIMIT)));
        } catch (_) {
            // Ignore storage failures and keep in-memory chat available.
        }
    }

    function readOpenPreference(key) {
        try {
            return localStorage.getItem(key) === '1';
        } catch (_) {
            return false;
        }
    }

    function persistOpenPreference(key, value) {
        try {
            localStorage.setItem(key, value ? '1' : '0');
        } catch (_) {
            // Ignore preference storage failures.
        }
    }

    function ensureTaxCenterNavLink() {
        var sidebarNav = document.querySelector('.sidebar-nav');
        if (!sidebarNav) return;

        if (sidebarNav.querySelector('a[href="tax-center.html"]')) return;

        var sections = sidebarNav.querySelectorAll('.sidebar-section');
        var analyticsSection = null;
        sections.forEach(function (section) {
            var title = section.querySelector('.sidebar-section-title');
            if (title && title.textContent.trim().toLowerCase() === 'analytics') {
                analyticsSection = section;
            }
        });

        if (!analyticsSection) return;

        var link = document.createElement('a');
        link.className = 'sidebar-link';
        link.href = 'tax-center.html';
        link.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l7 4v6c0 5-3.5 9.7-7 10-3.5-.3-7-5-7-10V6l7-4z"></path><path d="M9 12l2 2 4-4"></path></svg> Tax Center';

        var simulatorLink = analyticsSection.querySelector('a[href="simulator.html"]');
        if (simulatorLink) {
            simulatorLink.insertAdjacentElement('afterend', link);
        } else {
            analyticsSection.appendChild(link);
        }
    }

    function initSidebarNotificationBubbles() {
        if (isAdminUser(API.getUser())) return;

        clearCurrentFeatureBubble();
        refreshSidebarNotificationBubbles();

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                refreshSidebarNotificationBubbles();
            }
        });
    }

    function refreshSidebarNotificationBubbles() {
        if (isAdminUser(API.getUser())) return;

        var month = Utils.currentMonth();
        var year = Utils.currentYear();
        var taxSuggestionsPromise = userHasPremiumAccess()
            ? API.getTaxSuggestions({ year: year })
            : Promise.resolve({ suggestions: [] });

        Promise.allSettled([
            API.getBudgets({ month: month, year: year }),
            API.getSubscriptions(),
            API.getSavingsGoals(),
            API.getInsights(),
            taxSuggestionsPromise,
        ]).then(function (results) {
            var budgets = normalizeList(results, 0);
            var subscriptions = normalizeList(results, 1);
            var goals = normalizeList(results, 2);
            var insightsPayload = normalizeObject(results, 3);
            var taxPayload = normalizeObject(results, 4);

            var budgetAlertItems = budgets.filter(function (b) {
                return Number(b.percentage || 0) >= 80;
            });
            var budgetAlerts = budgetAlertItems.length;

            var dueSubscriptionItems = subscriptions.filter(function (s) {
                if (!s.is_active) return false;
                var left = daysUntil(s.next_date);
                return left !== null && left <= 7;
            });
            var dueSubscriptions = dueSubscriptionItems.length;

            var urgentGoalItems = goals.filter(function (g) {
                var progress = Number(g.progress || 0);
                var left = daysUntil(g.deadline);
                return progress < 100 && left !== null && left <= 30;
            });
            var urgentGoals = urgentGoalItems.length;

            var highPriorityInsightItems = (insightsPayload.insights || []).filter(function (item) {
                return String(item.priority || '').toLowerCase() === 'high';
            });
            var highPriorityInsights = highPriorityInsightItems.length;

            var actionableTaxItems = (taxPayload.suggestions || []).filter(function (item) {
                return String(item.priority || '').toLowerCase() !== 'low';
            });
            var actionableTax = actionableTaxItems.length;

            syncSidebarBubble(
                'budgets.html',
                budgetAlerts,
                budgetAlerts >= 2 ? 'danger' : 'warning',
                buildSignature(budgetAlertItems, function (b) {
                    return [
                        b.id,
                        Math.round(Number(b.percentage || 0)),
                        Number(b.spent || 0).toFixed(2),
                        Number(b.amount || 0).toFixed(2),
                    ].join(':');
                })
            );

            syncSidebarBubble(
                'subscriptions.html',
                dueSubscriptions,
                dueSubscriptions >= 2 ? 'danger' : 'warning',
                buildSignature(dueSubscriptionItems, function (s) {
                    return [
                        s.id,
                        s.next_date || '',
                        Number(s.amount || 0).toFixed(2),
                        s.frequency || '',
                    ].join(':');
                })
            );

            syncSidebarBubble(
                'goals.html',
                urgentGoals,
                urgentGoals >= 2 ? 'danger' : 'warning',
                buildSignature(urgentGoalItems, function (g) {
                    return [
                        g.id,
                        g.deadline || '',
                        Math.round(Number(g.progress || 0)),
                        Number(g.current_amount || 0).toFixed(2),
                        Number(g.target_amount || 0).toFixed(2),
                    ].join(':');
                })
            );

            syncSidebarBubble(
                'insights.html',
                highPriorityInsights,
                highPriorityInsights >= 2 ? 'danger' : 'info',
                buildSignature(highPriorityInsightItems, function (item) {
                    return [
                        item.priority || '',
                        item.type || '',
                        item.title || '',
                        item.message || '',
                    ].join(':');
                })
            );

            syncSidebarBubble(
                'tax-center.html',
                actionableTax,
                actionableTax >= 2 ? 'warning' : 'info',
                buildSignature(actionableTaxItems, function (item) {
                    return [
                        item.priority || '',
                        item.section || '',
                        item.title || '',
                        item.message || '',
                    ].join(':');
                })
            );
        }).catch(function () {
            // Sidebar bubbles are best-effort UI hints. Ignore transient failures.
        });
    }

    function buildSignature(items, mapper) {
        if (!Array.isArray(items) || !items.length) return '';

        return items
            .map(function (item) { return mapper(item); })
            .filter(Boolean)
            .sort()
            .join('||');
    }

    function normalizeList(results, index) {
        var payload = normalizeObject(results, index);
        if (Array.isArray(payload)) return payload;
        if (payload && Array.isArray(payload.results)) return payload.results;
        return [];
    }

    function normalizeObject(results, index) {
        var item = results[index];
        if (!item || item.status !== 'fulfilled') return {};
        return item.value || {};
    }

    function syncSidebarBubble(href, count, tone, signature) {
        if (!BUBBLE_FEATURE_PAGES[href]) {
            setSidebarBubble(href, count, tone);
            return;
        }

        var safeSignature = signature || '';

        if (currentPage === href) {
            saveSeenSignature(href, safeSignature);
            setSidebarBubble(href, 0, tone);
            return;
        }

        var seen = getSeenSignature(href);
        var hasNewData = !!safeSignature && safeSignature !== seen;
        setSidebarBubble(href, hasNewData ? count : 0, tone);
    }

    function clearCurrentFeatureBubble() {
        if (!BUBBLE_FEATURE_PAGES[currentPage]) return;
        setSidebarBubble(currentPage, 0, 'info');
    }

    function getSeenSignature(href) {
        try {
            return localStorage.getItem(SIDEBAR_SEEN_PREFIX + href) || '';
        } catch (_) {
            return '';
        }
    }

    function saveSeenSignature(href, signature) {
        try {
            localStorage.setItem(SIDEBAR_SEEN_PREFIX + href, signature || '');
        } catch (_) {
            // Ignore storage failures and keep bubbles as best effort.
        }
    }

    function setSidebarBubble(href, count, tone) {
        var link = document.querySelector('.sidebar-link[href="' + href + '"]');
        if (!link) return;

        var numericCount = Number(count || 0);
        var bubble = link.querySelector('.sidebar-notification-badge');

        if (numericCount <= 0) {
            if (bubble) bubble.remove();
            return;
        }

        if (!bubble) {
            bubble = document.createElement('span');
            bubble.className = 'sidebar-notification-badge';
            link.appendChild(bubble);
        }

        bubble.classList.remove('tone-danger', 'tone-warning', 'tone-info');
        bubble.classList.add(tone === 'danger' ? 'tone-danger' : tone === 'warning' ? 'tone-warning' : 'tone-info');
        bubble.textContent = numericCount > SIDEBAR_BUBBLE_MAX ? (SIDEBAR_BUBBLE_MAX + '+') : String(numericCount);
        bubble.setAttribute('aria-label', numericCount + ' pending items');
        bubble.setAttribute('title', numericCount + ' pending items');
    }

    function daysUntil(dateStr) {
        if (!dateStr) return null;

        var target = new Date(dateStr + 'T00:00:00');
        if (Number.isNaN(target.getTime())) return null;

        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var diffMs = target.getTime() - today.getTime();
        return Math.ceil(diffMs / 86400000);
    }

    /* Theme toggle in top bar */
    var topThemeToggle = document.getElementById('topThemeToggle');
    var savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    setTheme(savedTheme, false, false);

    if (topThemeToggle) {
        topThemeToggle.addEventListener('click', function () {
            var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            var nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
            setTheme(nextTheme, true, true);
        });
    }

    // Expose theme setter for pages like profile settings where theme can change via select.
    window.setAppTheme = function (theme) {
        setTheme(theme, true, false);
    };

    /* Font size controls */
    var fontDecreaseBtn = document.getElementById('fontDecreaseBtn');
    var fontIncreaseBtn = document.getElementById('fontIncreaseBtn');

    if (fontDecreaseBtn) {
        fontDecreaseBtn.addEventListener('click', function () {
            applyFontSize(getCurrentFontSize() - 1, true);
        });
    }
    if (fontIncreaseBtn) {
        fontIncreaseBtn.addEventListener('click', function () {
            applyFontSize(getCurrentFontSize() + 1, true);
        });
    }

    // Reflect current value in header controls.
    updateFontSizeUI();

    function setTheme(theme, shouldPersist, syncProfile) {
        var nextTheme = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);

        if (shouldPersist) {
            localStorage.setItem(THEME_KEY, nextTheme);
        }

        updateThemeToggleUI(nextTheme);

        if (syncProfile) {
            API.updateProfile({ dark_mode: nextTheme === 'dark' }).catch(function () { });
        }
    }

    function updateThemeToggleUI(theme) {
        var toggle = document.getElementById('topThemeToggle');
        if (!toggle) return;

        var icon = theme === 'dark'
            ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
            : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

        toggle.innerHTML = icon;
        toggle.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }

    function ensureTopbarSettings() {
        var mainHeader = document.querySelector('.main-header');
        if (!mainHeader) return;

        var headerRight = mainHeader.querySelector('.main-header-right');
        if (!headerRight) {
            headerRight = document.createElement('div');
            headerRight.className = 'main-header-right';
            mainHeader.appendChild(headerRight);
        }

        if (document.getElementById('topbarSettings')) return;

        var settings = document.createElement('div');
        settings.id = 'topbarSettings';
        settings.className = 'topbar-settings';
        settings.innerHTML =
            '<button type="button" class="topbar-setting-btn" id="topThemeToggle" aria-label="Toggle theme" title="Toggle theme"></button>' +
            '<div class="font-size-controls" role="group" aria-label="Font size controls">' +
            '<button type="button" class="font-size-btn" id="fontDecreaseBtn" aria-label="Decrease font size" title="Decrease font size">A-</button>' +
            '<span class="font-size-value" id="fontSizeLabel">100%</span>' +
            '<button type="button" class="font-size-btn" id="fontIncreaseBtn" aria-label="Increase font size" title="Increase font size">A+</button>' +
            '</div>';

        headerRight.insertBefore(settings, headerRight.firstChild);
    }

    function applyStoredFontSizePreference() {
        var storedSize = parseInt(localStorage.getItem(FONT_SIZE_KEY), 10);
        if (Number.isNaN(storedSize)) {
            document.documentElement.style.fontSize = FONT_SIZE_DEFAULT + 'px';
            return FONT_SIZE_DEFAULT;
        }
        return applyFontSize(storedSize, false);
    }

    function applyFontSize(size, persist) {
        var clampedSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
        document.documentElement.style.fontSize = clampedSize + 'px';

        if (persist) {
            localStorage.setItem(FONT_SIZE_KEY, String(clampedSize));
        }

        updateFontSizeUI();
        return clampedSize;
    }

    function getCurrentFontSize() {
        var current = parseFloat(window.getComputedStyle(document.documentElement).fontSize);
        return Number.isNaN(current) ? FONT_SIZE_DEFAULT : Math.round(current);
    }

    function updateFontSizeUI() {
        var current = getCurrentFontSize();
        var percent = Math.round((current / FONT_SIZE_DEFAULT) * 100);

        var label = document.getElementById('fontSizeLabel');
        if (label) {
            label.textContent = percent + '%';
        }

        var decBtn = document.getElementById('fontDecreaseBtn');
        var incBtn = document.getElementById('fontIncreaseBtn');
        if (decBtn) decBtn.disabled = current <= FONT_SIZE_MIN;
        if (incBtn) incBtn.disabled = current >= FONT_SIZE_MAX;
    }

    /* Sidebar mobile toggle */
    var menuToggle = document.getElementById('menuToggle');
    var sidebar = document.querySelector('.sidebar');
    var backdrop = document.getElementById('sidebarBackdrop');
    var sidebarNav = document.querySelector('.sidebar-nav');

    function closeSidebar() {
        if (sidebar) sidebar.classList.remove('open');
        if (backdrop) backdrop.classList.remove('visible');
    }

    /* Restore sidebar scroll position */
    if (sidebarNav) {
        var savedScroll = sessionStorage.getItem('sf_sidebar_scroll');
        if (savedScroll) {
            sidebarNav.scrollTop = parseInt(savedScroll, 10);
        }

        sidebarNav.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                sessionStorage.setItem('sf_sidebar_scroll', sidebarNav.scrollTop);
            });
        });
    }

    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', function () {
            var isOpen = sidebar.classList.contains('open');
            if (isOpen) {
                closeSidebar();
                return;
            }

            sidebar.classList.add('open');
            if (backdrop) backdrop.classList.add('visible');
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', closeSidebar);
    }

    if (sidebarNav) {
        sidebarNav.addEventListener('click', function (e) {
            var link = e.target.closest('a.sidebar-link');
            if (!link) return;
            if (window.innerWidth <= 992) {
                closeSidebar();
            }
        });
    }

    window.addEventListener('resize', function () {
        if (window.innerWidth > 992) {
            closeSidebar();
        }
    });

    /* Logout */
    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function (e) {
            e.preventDefault();
            API.logout()
                .catch(function () { return null; })
                .then(function () {
                    window.location.href = 'login.html';
                });
        });
    }

    /* Current date display */
    var currentDateEl = document.getElementById('currentDate');
    if (currentDateEl) {
        var now = new Date();
        var opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        currentDateEl.textContent = now.toLocaleDateString('en-US', opts);
    }

    /* Close modals on backdrop / Escape */
    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('modal') && e.target.classList.contains('active')) {
            Utils.closeModal(e.target.id);
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (sidebar && sidebar.classList.contains('open')) {
                closeSidebar();
                return;
            }

            var modal = document.querySelector('.modal.active');
            if (modal) Utils.closeModal(modal.id);
        }
    });
})();
