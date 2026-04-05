/*
 * ============================================================================
 * FILE: web-app/public/js/register.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Handles frontend interactivity for registration pages.
 *   Note: The top half of this file contains unused legacy 'IBM Loyalty Demo' code.
 *   The bottom half handles modern Veritas-Ledger password visibility toggles
 *   and CSRF token injection for jQuery AJAX.
 * ============================================================================
 */

'use strict';

let apiUrl = location.protocol + '//' + location.host + '/api/';

console.log('at register.js');

/*
 * ===== GLOBAL SECURITY HOOK =====
 * WHAT: Attaches our CSRF token to EVERY SINGLE jQuery AJAX request automatically.
 * WHY: Cross-Site Request Forgery (CSRF) is a lethal attack where a malicious site 
 *   tricks your browser into sending a request to our server. By extracting the 
 *   hidden `_csrf` input field created by `security-middleware.js`, and appending it
 *   as an `X-XSRF-Token` header, we guarantee the request genuinely came from our UI.
 */
$.ajaxSetup({
    beforeSend: function (xhr, settings) {
        // We only care about state-changing requests (POST, PUT, DELETE), not GET/HEAD.
        if (!/^(GET|HEAD|OPTIONS|TRACE)$/i.test(settings.type)) {
            const token = $('input[name="_csrf"]').val();
            if (token) {
                xhr.setRequestHeader('X-XSRF-Token', token);
            }
        }
    }
});


// ----------------------------------------------------------------------------
// MODERN VERITAS UI FUNCTIONALITY
// ----------------------------------------------------------------------------


/*
 * ===== Password Visibility Toggle (Click to Toggle) =====
 * WHAT: Attaches event listeners to the "Eye" icons on login and registration pages.
 * WHY: Improves UX greatly by letting users verify their complex passwords.
 */
function setupPasswordToggle(toggleBtnId, inputId) {
    var btn = document.getElementById(toggleBtnId);
    if (!btn) return;
    var input = document.getElementById(inputId);

    btn.addEventListener('click', function () {
        // Swap HTML input type between 'password' (hidden dots) and 'text' (visible)
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);

        // Toggle the Feather-icon graphic from Open Eye to Closed Eye
        const icon = btn.querySelector('i');
        if (icon) {
            const iconName = type === 'password' ? 'eye' : 'eye-off';
            icon.setAttribute('data-feather', iconName);
            // We must re-render the SVG immediately
            if (window.feather) {
                feather.replace();
            }
        }
    });
}


/*
 * ===== FRONTEND FORM VALIDATION =====
 * WHAT: Prevents the user from even submitting the form if the passwords don't match.
 * WHY: Saves a network request, reduces server load, provides instant feedback.
 */
$(document).ready(function () {
    // Registration Toggles Attachments
    setupPasswordToggle('toggleUniPass', 'uniPassword');
    setupPasswordToggle('toggleUniPassConfirm', 'uniPasswordConfirm');
    setupPasswordToggle('toggleStuPass', 'stuPassword');
    setupPasswordToggle('toggleStuPassConfirm', 'stuPasswordConfirm');

    // Login Toggles Attachments
    setupPasswordToggle('toggleUniLoginPass', 'uniLoginPassword');
    setupPasswordToggle('toggleStuLoginPass', 'stuLoginPassword');

    // University Registration Form specific interceptor
    $('form[action="/university/register/submit"]').on('submit', function (e) {
        var pass = $('#uniPassword').val();
        var confirm = $('#uniPasswordConfirm').val();
        if (pass !== confirm) {
            e.preventDefault(); // Stop the form completely
            $('#uniPassMismatch').fadeIn(); // Flash the red error box
            return false;
        }
        $('#uniPassMismatch').hide();
    });

    // Student Registration Form specific interceptor
    $('form[action="/student/register/submit"]').on('submit', function (e) {
        var pass = $('#stuPassword').val();
        var confirm = $('#stuPasswordConfirm').val();
        if (pass !== confirm) {
            e.preventDefault();
            $('#stuPassMismatch').fadeIn();
            return false;
        }
        $('#stuPassMismatch').hide();
    });

    // Once they start typing again, hide the red warning box automatically
    $('#uniPasswordConfirm, #uniPassword').on('input', function () { $('#uniPassMismatch').fadeOut(); });
    $('#stuPasswordConfirm, #stuPassword').on('input', function () { $('#stuPassMismatch').fadeOut(); });
});
