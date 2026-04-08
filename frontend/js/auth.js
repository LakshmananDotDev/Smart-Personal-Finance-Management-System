/**
 * Auth page logic — login and signup forms
 */

(function () {
    'use strict';

    var redirectIntent = resolveRedirectIntent();

    function sanitizeNextPath(nextRaw) {
        if (!nextRaw) return '';

        try {
            var nextUrl = new URL(nextRaw, window.location.href);
            if (nextUrl.origin !== window.location.origin) return '';

            var normalizedPath = nextUrl.pathname.replace(/^\/+/, '');
            if (!/\.html$/i.test(normalizedPath)) return '';
            if (/^(login|signup)\.html$/i.test(normalizedPath)) return '';

            return normalizedPath + (nextUrl.search || '') + (nextUrl.hash || '');
        } catch (_) {
            return '';
        }
    }

    function resolveRedirectIntent() {
        try {
            var params = new URLSearchParams(window.location.search || '');
            var nextRaw = (params.get('next') || params.get('redirect') || '').trim();
            return {
                next: sanitizeNextPath(nextRaw),
            };
        } catch (_) {
            return { next: '' };
        }
    }

    function getPostAuthDestination(profile) {
        if (profile && (profile.role === 'admin' || profile.is_superuser === true)) {
            return redirectIntent.next || 'admin.html';
        }

        if (profile && !profile.is_onboarded) {
            return 'onboarding.html';
        }

        if (redirectIntent.next) {
            return redirectIntent.next;
        }

        return 'dashboard.html';
    }

    // Redirect if already logged in (validate token first)
    if (API.isLoggedIn()) {
        API.getProfile()
            .then(function (profile) {
                API.setUser(profile);
                window.location.href = getPostAuthDestination(profile);
            })
            .catch(function () {
                // Token is stale/invalid — clear it and stay on auth page
                API.clearAuth();
            });
    }

    var errorBox = document.getElementById('authError');

    function showError(msg) {
        if (errorBox) {
            errorBox.textContent = msg;
            errorBox.classList.add('visible');
        }
    }

    function hideError() {
        if (errorBox) {
            errorBox.classList.remove('visible');
        }
    }

    function propagateNextParamToAuthLinks() {
        if (!redirectIntent.next) return;

        document.querySelectorAll('.auth-footer a[href="signup.html"], .auth-footer a[href="login.html"]').forEach(function (link) {
            var targetPage = link.getAttribute('href') || '';
            if (!targetPage) return;

            link.href = targetPage + '?next=' + encodeURIComponent(redirectIntent.next);
        });
    }

    propagateNextParamToAuthLinks();

    // Login form
    var loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            hideError();
            var email = document.getElementById('email').value.trim();
            var password = document.getElementById('password').value;

            if (!email || !password) {
                showError('Please fill in all fields.');
                return;
            }

            var btn = document.getElementById('loginBtn');
            var spinner = document.getElementById('loginSpinner');
            var btnText = btn.querySelector('.btn-text');
            btnText.textContent = 'Logging in...';
            if (spinner) spinner.style.display = 'inline-block';
            btn.disabled = true;

            API.login(email, password)
                .then(function (data) {
                    window.location.href = getPostAuthDestination(data.user);
                })
                .catch(function (err) {
                    var msg = 'Login failed. Please try again.';
                    if (err && err.message) {
                        msg = err.message;
                    } else if (err && typeof err.error === 'string') {
                        msg = err.error;
                    } else if (err && (err.name === 'TypeError' || /failed to fetch/i.test(String(err.message || '')))) {
                        msg = 'Cannot reach backend from this browser. Open the app via http://localhost:3000 (not file://) and ensure backend is running on port 8000.';
                    }
                    showError(msg);
                    btnText.textContent = 'Log In';
                    if (spinner) spinner.style.display = 'none';
                    btn.disabled = false;
                });
        });
    }

    function setSignupOtpHint(message, tone) {
        var hint = document.getElementById('signupOtpHint');
        if (!hint) return;

        hint.style.display = 'block';
        hint.textContent = message || 'We will send a verification code to your email.';

        if (tone === 'error') {
            hint.style.color = 'var(--color-danger)';
            return;
        }
        if (tone === 'success') {
            hint.style.color = 'var(--color-success)';
            return;
        }
        hint.style.color = 'var(--color-text-secondary)';
    }

    function collectSignupData() {
        return {
            first_name: document.getElementById('firstName').value.trim(),
            last_name: document.getElementById('lastName').value.trim(),
            username: document.getElementById('username').value.trim(),
            email: document.getElementById('email').value.trim().toLowerCase(),
            password: document.getElementById('password').value,
            password_confirm: document.getElementById('passwordConfirm').value,
        };
    }

    function validateSignupData(data) {
        if (!data.username || !data.email || !data.password) {
            return 'Please fill in all required fields.';
        }
        if (data.password !== data.password_confirm) {
            return 'Passwords do not match.';
        }
        return '';
    }

    // Signup form
    var signupForm = document.getElementById('signupForm');
    if (signupForm) {
        var signupBtn = document.getElementById('signupBtn');
        var signupSpinner = document.getElementById('signupSpinner');
        var signupBtnText = signupBtn ? signupBtn.querySelector('.btn-text') : null;
        var signupOtpGroup = document.getElementById('signupOtpGroup');
        var signupOtpCode = document.getElementById('signupOtpCode');
        var verifySignupOtpBtn = document.getElementById('verifySignupOtpBtn');
        var pendingSignupEmail = '';

        signupForm.addEventListener('submit', function (e) {
            e.preventDefault();
            hideError();
            setSignupOtpHint('Sending verification code...', 'normal');

            var data = collectSignupData();
            var validationError = validateSignupData(data);
            if (validationError) {
                showError(validationError);
                setSignupOtpHint('We will send a verification code to your email.', 'error');
                return;
            }

            if (signupBtnText) signupBtnText.textContent = 'Sending Code...';
            if (signupSpinner) signupSpinner.style.display = 'inline-block';
            if (signupBtn) signupBtn.disabled = true;

            API.requestSignupOtp(data.email)
                .then(function (otpData) {
                    pendingSignupEmail = data.email;
                    if (signupOtpGroup) signupOtpGroup.style.display = '';
                    if (verifySignupOtpBtn) verifySignupOtpBtn.style.display = '';
                    if (signupBtnText) signupBtnText.textContent = 'Resend Verification Code';
                    if (signupOtpCode) signupOtpCode.focus();

                    var hint = 'Verification code sent. It expires in ' + Math.ceil((otpData.expires_in || 600) / 60) + ' minutes.';
                    if (otpData.otp) {
                        hint += ' Demo OTP: ' + otpData.otp;
                    }
                    setSignupOtpHint(hint, 'success');
                })
                .catch(function (err) {
                    var msg = (typeof err === 'object') ? Utils.parseApiErrors(err) : 'Registration failed.';
                    showError(msg);
                    if (signupBtnText) signupBtnText.textContent = 'Send Verification Code';
                    setSignupOtpHint('Unable to send verification code right now.', 'error');
                })
                .finally(function () {
                    if (signupSpinner) signupSpinner.style.display = 'none';
                    if (signupBtn) signupBtn.disabled = false;
                });
        });

        if (verifySignupOtpBtn) {
            verifySignupOtpBtn.addEventListener('click', function () {
                hideError();

                var data = collectSignupData();
                var validationError = validateSignupData(data);
                if (validationError) {
                    showError(validationError);
                    return;
                }

                var otpCode = signupOtpCode ? signupOtpCode.value.trim() : '';
                if (!/^\d{6}$/.test(otpCode)) {
                    showError('Please enter the 6-digit verification code.');
                    return;
                }

                if (!pendingSignupEmail) {
                    showError('Please request a verification code first.');
                    return;
                }

                if (data.email !== pendingSignupEmail) {
                    showError('Email was changed after requesting code. Please request a new verification code.');
                    return;
                }

                verifySignupOtpBtn.disabled = true;
                verifySignupOtpBtn.textContent = 'Verifying...';

                API.verifySignupOtp({
                    first_name: data.first_name,
                    last_name: data.last_name,
                    username: data.username,
                    email: data.email,
                    password: data.password,
                    password_confirm: data.password_confirm,
                    otp: otpCode,
                })
                    .then(function (regData) {
                        window.location.href = getPostAuthDestination(regData.user);
                    })
                    .catch(function (err) {
                        var msg = (typeof err === 'object') ? Utils.parseApiErrors(err) : 'Verification failed.';
                        showError(msg);
                    })
                    .finally(function () {
                        verifySignupOtpBtn.disabled = false;
                        verifySignupOtpBtn.textContent = 'Verify Code & Create Account';
                    });
            });
        }
    }

    // Google login via Google Identity Services
    var GOOGLE_CLIENT_ID = '527735791870-h6jj1isgujl0cn56vvmf1a69riggmbk6.apps.googleusercontent.com';
    var googleBtn = document.getElementById('googleLoginBtn');

    function initGoogleLogin() {
        if (typeof google === 'undefined' || !google.accounts) {
            // SDK not loaded yet, retry
            setTimeout(initGoogleLogin, 200);
            return;
        }

        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleResponse,
            auto_select: false,
        });

        if (googleBtn) {
            googleBtn.addEventListener('click', function () {
                hideError();
                google.accounts.id.prompt(function (notification) {
                    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                        // One Tap unavailable — show rendered Google button as fallback
                        showGooglePopup();
                    }
                });
            });
        }
    }

    function showGooglePopup() {
        // Use the rendered button approach as a reliable fallback
        // Create a temporary container for the Google button
        var tempDiv = document.createElement('div');
        tempDiv.style.position = 'fixed';
        tempDiv.style.top = '50%';
        tempDiv.style.left = '50%';
        tempDiv.style.transform = 'translate(-50%, -50%)';
        tempDiv.style.zIndex = '10000';
        tempDiv.style.background = '#fff';
        tempDiv.style.padding = '24px';
        tempDiv.style.borderRadius = '12px';
        tempDiv.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3)';
        tempDiv.id = 'google-popup-fallback';

        var overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '9999';
        overlay.id = 'google-popup-overlay';
        overlay.addEventListener('click', function () {
            document.body.removeChild(overlay);
            document.body.removeChild(tempDiv);
        });

        var btnContainer = document.createElement('div');
        tempDiv.appendChild(btnContainer);
        document.body.appendChild(overlay);
        document.body.appendChild(tempDiv);

        google.accounts.id.renderButton(btnContainer, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            width: 300,
        });
    }

    function handleGoogleResponse(response) {
        if (!response.credential) {
            showError('Google sign-in failed. Please try again.');
            return;
        }

        // Remove fallback popup if present
        var overlay = document.getElementById('google-popup-overlay');
        var popup = document.getElementById('google-popup-fallback');
        if (overlay) overlay.remove();
        if (popup) popup.remove();

        if (googleBtn) {
            googleBtn.disabled = true;
            googleBtn.textContent = 'Signing in...';
        }

        API.googleLogin(response.credential)
            .then(function (data) {
                window.location.href = getPostAuthDestination(data.user);
            })
            .catch(function (err) {
                var msg = (err && (err.message || (typeof err.error === 'string' ? err.error : ''))) || 'Google login failed. Please try again.';
                showError(msg);
                if (googleBtn) {
                    googleBtn.disabled = false;
                    googleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Continue with Google';
                }
            });
    }

    initGoogleLogin();
})();
