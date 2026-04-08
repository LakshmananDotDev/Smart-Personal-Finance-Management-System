/**
 * Admin login page logic
 */

(function () {
    'use strict';

    var form = document.getElementById('adminLoginForm');
    var errorBox = document.getElementById('adminAuthError');

    function showError(message) {
        if (!errorBox) return;
        errorBox.textContent = message;
        errorBox.classList.add('visible');
    }

    function hideError() {
        if (!errorBox) return;
        errorBox.classList.remove('visible');
    }

    function routeIfAlreadyAdmin() {
        if (!API.isLoggedIn()) return;

        API.getProfile()
            .then(function (profile) {
                API.setUser(profile);
                if (profile.role === 'admin' || profile.is_superuser === true) {
                    window.location.href = 'admin.html';
                    return;
                }
                API.clearAuth();
            })
            .catch(function () {
                API.clearAuth();
            });
    }

    routeIfAlreadyAdmin();

    if (!form) return;

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        hideError();

        var email = (document.getElementById('adminEmail').value || '').trim();
        var password = document.getElementById('adminPassword').value || '';

        if (!email || !password) {
            showError('Please enter both email and password.');
            return;
        }

        var button = document.getElementById('adminLoginBtn');
        var spinner = document.getElementById('adminLoginSpinner');
        var buttonText = button ? button.querySelector('.btn-text') : null;

        if (buttonText) buttonText.textContent = 'Signing in...';
        if (spinner) spinner.style.display = 'inline-block';
        if (button) button.disabled = true;

        API.loginAdmin(email, password)
            .then(function (payload) {
                var user = payload && payload.user ? payload.user : API.getUser();
                if (user && (user.role === 'admin' || user.is_superuser === true)) {
                    window.location.href = 'admin.html';
                    return;
                }

                API.clearAuth();
                showError('This account does not have admin access.');
            })
            .catch(function (err) {
                showError(Utils.parseApiErrors(err));
            })
            .finally(function () {
                if (buttonText) buttonText.textContent = 'Sign In as Admin';
                if (spinner) spinner.style.display = 'none';
                if (button) button.disabled = false;
            });
    });
})();
