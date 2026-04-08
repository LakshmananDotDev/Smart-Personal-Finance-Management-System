/**
 * API Client — handles all HTTP communication with the Django backend.
 * Provides a clean interface with automatic JWT token handling.
 */

var API = (function () {
    'use strict';

    var BASE_URL = 'http://127.0.0.1:8000/api';
    var TOKEN_KEY = 'sf_token';
    var REFRESH_TOKEN_KEY = 'sf_refresh_token';
    var USER_KEY = 'sf_user';

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function setToken(token) {
        localStorage.setItem(TOKEN_KEY, token);
    }

    function getRefreshToken() {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    }

    function setRefreshToken(token) {
        if (!token) return;
        localStorage.setItem(REFRESH_TOKEN_KEY, token);
    }

    function getUser() {
        var data = localStorage.getItem(USER_KEY);
        return data ? JSON.parse(data) : null;
    }

    function setUser(user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function clearAuth() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    function isLoggedIn() {
        return !!getToken();
    }

    var refreshPromise = null;

    function headers(isJson, includeAuth) {
        var h = {};
        if (includeAuth !== false) {
            var token = getToken();
            if (token) {
                h['Authorization'] = 'Bearer ' + token;
            }
        }
        if (isJson) {
            h['Content-Type'] = 'application/json';
        }
        return h;
    }

    function withStatus(data, statusCode, fallbackMessage) {
        var payload = data;
        if (!payload || typeof payload !== 'object') {
            payload = { error: fallbackMessage };
        }
        payload.status = statusCode;
        return payload;
    }

    function parseErrorResponse(response, fallbackMessage) {
        return response.json().then(function (data) {
            return Promise.reject(withStatus(data, response.status, fallbackMessage));
        }, function () {
            return Promise.reject(withStatus(null, response.status, fallbackMessage));
        });
    }

    function redirectUnauthorized() {
        var page = window.location.pathname.split('/').pop();
        if (page === 'login.html' || page === 'signup.html') return;

        clearAuth();
        window.location.href = 'login.html';
    }

    function setAuthFromResponse(data) {
        if (!data || typeof data !== 'object') return;

        var accessToken = data.access_token || data.token;
        if (accessToken) {
            setToken(accessToken);
        }
        if (data.refresh_token) {
            setRefreshToken(data.refresh_token);
        }
    }

    function refreshAccessToken() {
        var refreshToken = getRefreshToken();
        if (!refreshToken) {
            return Promise.reject({ error: 'Refresh token missing.', status: 401 });
        }

        if (refreshPromise) {
            return refreshPromise;
        }

        refreshPromise = fetch(BASE_URL + '/auth/refresh/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        })
            .then(function (response) {
                if (!response.ok) {
                    return parseErrorResponse(response, 'Session expired. Please log in again.');
                }
                return response.json();
            })
            .then(function (data) {
                setAuthFromResponse(data);
                if (data.user) setUser(data.user);
                return data;
            })
            .catch(function (err) {
                clearAuth();
                return Promise.reject(err);
            })
            .finally(function () {
                refreshPromise = null;
            });

        return refreshPromise;
    }

    function request(method, path, options) {
        options = options || {};

        var requestHeaders = headers(options.isJson, options.includeAuth);
        if (options.isFormData) {
            delete requestHeaders['Content-Type'];
        }

        var fetchOptions = {
            method: method,
            headers: requestHeaders,
        };

        if (typeof options.body !== 'undefined') {
            fetchOptions.body = options.isFormData ? options.body : JSON.stringify(options.body);
        }

        return fetch(BASE_URL + path, fetchOptions).then(function (response) {
            if (response.status === 401 && !options._retried && getRefreshToken()) {
                return refreshAccessToken().then(function () {
                    return request(method, path, {
                        body: options.body,
                        isJson: options.isJson,
                        isFormData: options.isFormData,
                        includeAuth: options.includeAuth,
                        _retried: true,
                    });
                }, function () {
                    redirectUnauthorized();
                    return parseErrorResponse(response, 'Unauthorized');
                });
            }

            if (response.status === 401) {
                redirectUnauthorized();
                return parseErrorResponse(response, 'Unauthorized');
            }

            if (!response.ok) {
                return parseErrorResponse(response, 'Request failed with status ' + response.status);
            }

            if (response.status === 204) {
                return null;
            }

            return response.json();
        });
    }

    function toQuery(params) {
        if (!params) return '';

        var query = Object.keys(params)
            .filter(function (k) { return params[k] !== '' && params[k] != null; })
            .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
            .join('&');

        return query ? ('?' + query) : '';
    }

    function get(path, params) {
        return request('GET', path + toQuery(params), { isJson: false });
    }

    function post(path, body) {
        return request('POST', path, { body: body, isJson: true });
    }

    function put(path, body) {
        return request('PUT', path, { body: body, isJson: true });
    }

    function patch(path, body) {
        return request('PATCH', path, { body: body, isJson: true });
    }

    function del(path) {
        return request('DELETE', path, { isJson: false });
    }

    // ---- Auth ----
    function login(email, password) {
        return post('/auth/login/', { email: email, password: password }).then(function (data) {
            setAuthFromResponse(data);
            setUser(data.user);
            return data;
        });
    }

    function loginAdmin(email, password) {
        return post('/auth/admin/login/', { email: email, password: password }).then(function (data) {
            setAuthFromResponse(data);
            setUser(data.user);
            return data;
        });
    }

    function requestSignupOtp(email) {
        return post('/auth/signup/request-otp/', { email: email });
    }

    function verifySignupOtp(payload) {
        return post('/auth/signup/verify-otp/', payload).then(function (data) {
            setAuthFromResponse(data);
            setUser(data.user);
            return data;
        });
    }

    function register(formData) {
        return post('/auth/register/', formData).then(function (data) {
            setAuthFromResponse(data);
            setUser(data.user);
            return data;
        });
    }

    function googleLogin(token) {
        return post('/auth/google-login/', { token: token }).then(function (data) {
            setAuthFromResponse(data);
            setUser(data.user);
            return data;
        });
    }

    function logout() {
        var refreshToken = getRefreshToken();
        if (!refreshToken) {
            clearAuth();
            return Promise.resolve();
        }

        return post('/auth/logout/', { refresh_token: refreshToken })
            .catch(function () {
                return null;
            })
            .then(function () {
                clearAuth();
            });
    }

    function getProfile() {
        return get('/auth/profile/');
    }

    function getEntitlements() {
        return get('/auth/entitlements/');
    }

    function updateProfile(data) {
        return patch('/auth/profile/', data);
    }

    function createPremiumOrder(planCode) {
        return post('/auth/premium/create-order/', { plan: planCode });
    }

    function verifyPremiumPayment(payload) {
        return post('/auth/premium/verify/', payload);
    }

    function changePassword(data) {
        return post('/auth/change-password/', data);
    }

    function setPassword(newPassword) {
        return post('/auth/set-password/', { new_password: newPassword });
    }

    function getAdminOverview() {
        return get('/auth/admin/overview/');
    }

    function getAdminUsers(params) {
        return get('/auth/admin/users/', params);
    }

    function updateAdminUser(userId, data) {
        return patch('/auth/admin/users/' + userId + '/', data);
    }

    function getAdminAuditLogs(params) {
        return get('/auth/admin/audit-logs/', params);
    }

    // ---- Finance ----
    function getCategories(params) { return get('/finance/categories/', params); }
    function getTransactions(params) { return get('/finance/transactions/', params); }
    function getSpendingMap(params) { return get('/finance/transactions/spending-map/', params); }
    function createTransaction(data) { return post('/finance/transactions/', data); }
    function updateTransaction(id, data) { return put('/finance/transactions/' + id + '/', data); }
    function deleteTransaction(id) { return del('/finance/transactions/' + id + '/'); }

    function getBudgets(params) { return get('/finance/budgets/', params); }
    function createBudget(data) { return post('/finance/budgets/', data); }
    function updateBudget(id, data) { return put('/finance/budgets/' + id + '/', data); }
    function deleteBudget(id) { return del('/finance/budgets/' + id + '/'); }

    function getSavingsGoals() { return get('/finance/savings-goals/'); }
    function createSavingsGoal(data) { return post('/finance/savings-goals/', data); }
    function updateSavingsGoal(id, data) { return put('/finance/savings-goals/' + id + '/', data); }
    function deleteSavingsGoal(id) { return del('/finance/savings-goals/' + id + '/'); }
    function addFundsToGoal(id, data) { return post('/finance/savings-goals/' + id + '/add-funds/', data); }
    function getGoalContributions(id) { return get('/finance/savings-goals/' + id + '/contributions/'); }

    function getAccounts() { return get('/finance/accounts/'); }
    function createAccount(data) { return post('/finance/accounts/', data); }
    function updateAccount(id, data) { return put('/finance/accounts/' + id + '/', data); }
    function deleteAccount(id) { return del('/finance/accounts/' + id + '/'); }

    function getSubscriptions() { return get('/finance/subscriptions/'); }
    function createSubscription(data) { return post('/finance/subscriptions/', data); }
    function updateSubscription(id, data) { return put('/finance/subscriptions/' + id + '/', data); }
    function deleteSubscription(id) { return del('/finance/subscriptions/' + id + '/'); }

    function getDashboard() { return get('/finance/dashboard/'); }
    function getReports(params) { return get('/finance/reports/', params); }

    // ---- Tax ----
    function getTaxSummary(params) { return get('/tax/summary/', params); }
    function getTaxRegimeComparison(params) { return get('/tax/regime-comparison/', params); }
    function getTaxEstimator(params) { return get('/tax/estimator/', params); }
    function getTaxSuggestions(params) { return get('/tax/suggestions/', params); }

    // ---- Insights ----
    function getInsights() { return get('/insights/'); }
    function autoCategorize(text) { return post('/insights/auto-categorize/', { text: text }); }
    function getHealthScore() { return get('/insights/health-score/'); }
    function detectSubscriptions() { return get('/insights/subscriptions/detect/'); }
    function getGoalPlan(goalId) { return get('/insights/goal-plan/', { goal_id: goalId }); }
    function getSimulatorBaseline() { return get('/insights/simulator/baseline/'); }
    function runSimulation(adjustments, months) { return post('/insights/simulator/simulate/', { adjustments: adjustments, months: months || 12 }); }
    function getBehavioralInsights() { return get('/insights/behavioral/'); }
    function getBudgetAlerts() { return get('/insights/alerts/'); }
    function chatbotMessage(payload) { return post('/insights/chatbot/', payload); }

    function scanReceipt(formData) {
        return request('POST', '/insights/scan-receipt/', {
            body: formData,
            isFormData: true,
            isJson: false,
        });
    }

    function previewCSV(formData) {
        return request('POST', '/insights/csv/preview/', {
            body: formData,
            isFormData: true,
            isJson: false,
        });
    }

    function importCSV(formData) {
        return request('POST', '/insights/csv/import/', {
            body: formData,
            isFormData: true,
            isJson: false,
        });
    }

    return {
        getToken: getToken,
        getUser: getUser,
        setUser: setUser,
        clearAuth: clearAuth,
        isLoggedIn: isLoggedIn,
        login: login,
        loginAdmin: loginAdmin,
        requestSignupOtp: requestSignupOtp,
        verifySignupOtp: verifySignupOtp,
        register: register,
        googleLogin: googleLogin,
        logout: logout,
        getProfile: getProfile,
        getEntitlements: getEntitlements,
        updateProfile: updateProfile,
        createPremiumOrder: createPremiumOrder,
        verifyPremiumPayment: verifyPremiumPayment,
        changePassword: changePassword,
        setPassword: setPassword,
        getAdminOverview: getAdminOverview,
        getAdminUsers: getAdminUsers,
        updateAdminUser: updateAdminUser,
        getAdminAuditLogs: getAdminAuditLogs,
        getCategories: getCategories,
        getTransactions: getTransactions,
        getSpendingMap: getSpendingMap,
        createTransaction: createTransaction,
        updateTransaction: updateTransaction,
        deleteTransaction: deleteTransaction,
        getBudgets: getBudgets,
        createBudget: createBudget,
        updateBudget: updateBudget,
        deleteBudget: deleteBudget,
        getSavingsGoals: getSavingsGoals,
        createSavingsGoal: createSavingsGoal,
        updateSavingsGoal: updateSavingsGoal,
        deleteSavingsGoal: deleteSavingsGoal,
        addFundsToGoal: addFundsToGoal,
        getGoalContributions: getGoalContributions,
        getAccounts: getAccounts,
        createAccount: createAccount,
        updateAccount: updateAccount,
        deleteAccount: deleteAccount,
        getSubscriptions: getSubscriptions,
        createSubscription: createSubscription,
        updateSubscription: updateSubscription,
        deleteSubscription: deleteSubscription,
        getDashboard: getDashboard,
        getReports: getReports,
        getTaxSummary: getTaxSummary,
        getTaxRegimeComparison: getTaxRegimeComparison,
        getTaxEstimator: getTaxEstimator,
        getTaxSuggestions: getTaxSuggestions,
        getInsights: getInsights,
        autoCategorize: autoCategorize,
        scanReceipt: scanReceipt,
        getHealthScore: getHealthScore,
        detectSubscriptions: detectSubscriptions,
        getGoalPlan: getGoalPlan,
        getSimulatorBaseline: getSimulatorBaseline,
        runSimulation: runSimulation,
        getBehavioralInsights: getBehavioralInsights,
        getBudgetAlerts: getBudgetAlerts,
        chatbotMessage: chatbotMessage,
        previewCSV: previewCSV,
        importCSV: importCSV,
    };
})();
