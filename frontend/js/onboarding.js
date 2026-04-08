/**
 * Onboarding — graphical card carousel
 */
(function () {
    'use strict';

    if (!API.isLoggedIn()) { window.location.href = 'login.html'; return; }

    var user = API.getUser();
    var needsPassword = false;
    var selectedGoal = '';
    var slides = [];      // ordered slide ids
    var idx = 0;          // current index

    var errorEl  = document.getElementById('obError');
    var dotsEl   = document.getElementById('obDots');
    var backBtn  = document.getElementById('obBack');
    var nextBtn  = document.getElementById('obNext');
    var skipBtn  = document.getElementById('obSkip');

    // ── Init ──
    API.getProfile().then(function (p) {
        user = p; API.setUser(p);
        needsPassword = !p.has_password;

        if (p.is_onboarded) { window.location.href = 'dashboard.html'; return; }

        // If not OAuth user, remove password slide from DOM
        if (!needsPassword) {
            var pwSlide = document.getElementById('passwordSlide');
            if (pwSlide) pwSlide.remove();
        }

        // Collect all remaining slides in DOM order
        var allSlides = document.querySelectorAll('.ob-slide');
        slides = [];
        for (var i = 0; i < allSlides.length; i++) {
            slides.push(allSlides[i].dataset.slide);
        }

        buildDots();
        show(0);
    }).catch(function () {
        API.clearAuth(); window.location.href = 'login.html';
    });

    // ── Dots ──
    function buildDots() {
        dotsEl.innerHTML = '';
        slides.forEach(function (_, i) {
            var d = document.createElement('div');
            d.className = 'ob-dot';
            d.addEventListener('click', function () { show(i); });
            dotsEl.appendChild(d);
        });
    }

    // ── Show slide ──
    function show(i) {
        idx = i; hideError();
        var all = document.querySelectorAll('.ob-slide');
        for (var j = 0; j < all.length; j++) all[j].classList.remove('active');

        var target = document.querySelector('[data-slide="' + slides[idx] + '"]');
        if (target) target.classList.add('active');

        // update dots
        var dots = dotsEl.querySelectorAll('.ob-dot');
        for (var k = 0; k < dots.length; k++) {
            dots[k].classList.remove('active');
            if (k < idx) dots[k].classList.add('visited');
            else dots[k].classList.remove('visited');
        }
        if (dots[idx]) dots[idx].classList.add('active');

        // button states
        backBtn.disabled = idx === 0;
        backBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';

        var isLast = slides[idx] === 'done';
        var isPw   = slides[idx] === 'password';
        var isSetup = slides[idx] === 'setup';

        nextBtn.textContent = isLast ? 'Go to Dashboard' : isPw ? 'Set Password' : isSetup ? 'Finish' : 'Next';
        skipBtn.style.display = (isLast || idx <= 0) ? 'none' : '';
    }

    // ── Next ──
    nextBtn.addEventListener('click', function () {
        var current = slides[idx];

        if (current === 'done') {
            sessionStorage.setItem('finyx_just_onboarded', 'true');
            window.location.href = 'dashboard.html'; return;
        }
        if (current === 'password') {
            handlePassword(); return;
        }
        if (current === 'setup') {
            handleSetup(); return;
        }

        if (idx < slides.length - 1) show(idx + 1);
    });

    // ── Back ──
    backBtn.addEventListener('click', function () {
        if (idx > 0) show(idx - 1);
    });

    // ── Skip ──
    skipBtn.addEventListener('click', function () {
        var current = slides[idx];
        if (current === 'password') {
            // skip password, go next
            show(idx + 1); return;
        }
        if (current === 'setup') {
            // skip setup — mark onboarded and go to dashboard
            API.updateProfile({ is_onboarded: true }).then(function (u) {
                sessionStorage.setItem('finyx_just_onboarded', 'true');
                API.setUser(u); window.location.href = 'dashboard.html';
            }).catch(function () { 
                sessionStorage.setItem('finyx_just_onboarded', 'true');
                window.location.href = 'dashboard.html'; 
            });
            return;
        }
        // default: skip to setup slide
        var setupIdx = slides.indexOf('setup');
        if (setupIdx >= 0) show(setupIdx);
        else show(slides.length - 1);
    });

    // ── Password ──
    var pwInput = document.getElementById('newPassword');
    var cfInput = document.getElementById('confirmPassword');

    if (pwInput) {
        pwInput.addEventListener('input', function () {
            var bars = [document.getElementById('str1'), document.getElementById('str2'), document.getElementById('str3'), document.getElementById('str4')];
            bars.forEach(function (b) { b.className = 'ob-str-bar'; });
            var pw = this.value;
            if (!pw) return;
            var s = 0;
            if (pw.length >= 6) s++;
            if (pw.length >= 8) s++;
            if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
            if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
            var lv = s <= 1 ? 'weak' : s <= 2 ? 'medium' : 'strong';
            for (var i = 0; i < s; i++) bars[i].classList.add(lv);
        });
    }

    function handlePassword() {
        hideError();
        var pw = pwInput.value, cf = cfInput.value;
        if (!pw || pw.length < 6) { showError('Password must be at least 6 characters.'); return; }
        if (pw !== cf) { showError('Passwords do not match.'); return; }

        nextBtn.disabled = true; nextBtn.textContent = 'Setting...';
        API.setPassword(pw).then(function () {
            needsPassword = false;
            show(idx + 1);
        }).catch(function (e) {
            showError((e && (e.message || (typeof e.error === 'string' ? e.error : ''))) || 'Failed to set password.');
        }).finally(function () {
            nextBtn.disabled = false; nextBtn.textContent = 'Set Password';
        });
    }

    // ── Setup / Personalize ──
    var goalBtns = document.querySelectorAll('.ob-goal-btn');
    goalBtns.forEach(function (b) {
        b.addEventListener('click', function () {
            goalBtns.forEach(function (g) { g.classList.remove('selected'); });
            this.classList.add('selected');
            selectedGoal = this.dataset.goal;
        });
    });

    function handleSetup() {
        hideError();
        var data = {
            currency: document.getElementById('onboardCurrency').value,
            is_onboarded: true
        };
        var inc = document.getElementById('onboardIncome').value;
        if (inc) data.monthly_income = parseFloat(inc);
        if (selectedGoal) data.financial_goal = selectedGoal;

        nextBtn.disabled = true; nextBtn.textContent = 'Saving...';
        API.updateProfile(data).then(function (u) {
            API.setUser(u);
            show(idx + 1);
        }).catch(function (e) {
            showError((typeof e === 'object') ? Utils.parseApiErrors(e) : 'Failed to save.');
        }).finally(function () {
            nextBtn.disabled = false; nextBtn.textContent = 'Finish';
        });
    }

    // ── Helpers ──
    function showError(msg) { errorEl.textContent = msg; }
    function hideError() { errorEl.textContent = ''; }

})();

