/* Landing page interactions */

(function () {
    'use strict';

    var FONT_SIZE_KEY = 'sf_font_size';
    var FONT_SIZE_DEFAULT = 16;
    var FONT_SIZE_MIN = 14;
    var FONT_SIZE_MAX = 20;

    try {
        var stored = parseInt(localStorage.getItem(FONT_SIZE_KEY), 10);
        var fontSize = Number.isNaN(stored) ? FONT_SIZE_DEFAULT : Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, stored));
        document.documentElement.style.fontSize = fontSize + 'px';
    } catch (err) {
        document.documentElement.style.fontSize = FONT_SIZE_DEFAULT + 'px';
    }

    // Navbar scroll effect
    var nav = document.getElementById('mainNav');
    window.addEventListener('scroll', function () {
        if (!nav) return;
        if (window.scrollY > 40) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
        link.addEventListener('click', function (e) {
            var target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    function scrollToPricingFromHash() {
        if ((window.location.hash || '').toLowerCase() !== '#pricing') return;

        var pricingSection = document.getElementById('pricing');
        if (!pricingSection) return;

        pricingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    window.addEventListener('hashchange', scrollToPricingFromHash);
    window.addEventListener('load', function () {
        window.setTimeout(scrollToPricingFromHash, 40);
    });
    scrollToPricingFromHash();

    // Intersection observer for scroll animations
    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.style.animationPlayState = 'running';
                        entry.target.classList.add('animate-visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15 }
        );

        document.querySelectorAll('.animate-fade-in-up, .animate-fade-in, .animate-scale-in').forEach(function (el) {
            el.style.animationPlayState = 'paused';
            observer.observe(el);
        });
    }

    // Mobile hamburger toggle
    var hamburger = document.getElementById('navHamburger');
    var navLinks = document.querySelector('.nav-links');
    var navInner = document.querySelector('.nav-inner');

    function closeMobileMenu() {
        if (!navLinks) return;
        navLinks.classList.remove('open');
        if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
    }

    if (hamburger) {
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.addEventListener('click', function () {
            if (!navLinks) return;
            navLinks.classList.toggle('open');
            hamburger.setAttribute('aria-expanded', navLinks.classList.contains('open') ? 'true' : 'false');
        });
    }

    if (navLinks) {
        navLinks.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                closeMobileMenu();
            });
        });
    }

    document.addEventListener('click', function (event) {
        if (!navInner || !navLinks || !navLinks.classList.contains('open')) return;
        if (!navInner.contains(event.target)) {
            closeMobileMenu();
        }
    });

    window.addEventListener('resize', function () {
        if (window.innerWidth > 820) {
            closeMobileMenu();
        }
    });

    function setPremiumCtaTargets(hasToken) {
        var premiumLinks = document.querySelectorAll('[data-premium-cta]');
        if (!premiumLinks.length) return;

        var profileUpgradeUrl = 'profile.html?upgrade=monthly';
        var loginUpgradeUrl = 'login.html?next=' + encodeURIComponent(profileUpgradeUrl);
        var target = hasToken ? profileUpgradeUrl : loginUpgradeUrl;

        premiumLinks.forEach(function (link) {
            link.href = target;
        });
    }

    // Redirect if already logged in
    var hasToken = !!localStorage.getItem('sf_token');
    if (hasToken) {
        var loginBtn = document.querySelector('.nav-actions .btn-ghost');
        if (loginBtn) {
            loginBtn.textContent = 'Dashboard';
            loginBtn.href = 'dashboard.html';
        }
    }

    setPremiumCtaTargets(hasToken);
})();
