'use strict';

let apiUrl = location.protocol + '//' + location.host + '/api/';

console.log('at register.js');

// Global CSRF Setup for AJAX
$.ajaxSetup({
    beforeSend: function (xhr, settings) {
        if (!/^(GET|HEAD|OPTIONS|TRACE)$/i.test(settings.type)) {
            const token = $('input[name="_csrf"]').val();
            if (token) {
                xhr.setRequestHeader('X-XSRF-Token', token);
            }
        }
    }
});

//check user input and call server to create dataset
$('.register-member').click(function () {

    //get user input data
    let formAccountNum = $('.account-number input').val();
    let formCardId = $('.card-id input').val();
    let formFirstName = $('.first-name input').val();
    let formLastName = $('.last-name input').val();
    let formEmail = $('.email input').val();
    let formPhoneNumber = $('.phone-number input').val();

    //create json data
    let inputData = '{' + '"firstname" : "' + formFirstName + '", ' + '"lastname" : "' + formLastName + '", ' + '"email" : "' + formEmail + '", ' + '"phonenumber" : "' + formPhoneNumber + '", ' + '"accountnumber" : "' + formAccountNum + '", ' + '"cardid" : "' + formCardId + '"}';
    console.log(inputData);

    //make ajax call to add the dataset
    $.ajax({
        type: 'POST',
        url: apiUrl + 'registerMember',
        data: inputData,
        dataType: 'json',
        contentType: 'application/json',
        beforeSend: function () {
            //display loading
            document.getElementById('registration').style.display = 'none';
            document.getElementById('loader').style.display = 'block';
        },
        success: function (data) {

            //remove loader
            document.getElementById('loader').style.display = 'none';

            //check data for error
            if (data.error) {
                document.getElementById('registration').style.display = 'block';
                alert(data.error);

            } else {
                //notify successful registration
                document.getElementById('successful-registration').style.display = 'block';
                document.getElementById('registration-info').style.display = 'none';
            }

        },
        error: function (jqXHR, textStatus, errorThrown) {
            //reload on error
            alert('Error: Try again');
            console.log(errorThrown);
            console.log(textStatus);
            console.log(jqXHR);
        }
    });

});


//check user input and call server to create dataset
$('.register-partner').click(function () {

    //get user input data
    let formName = $('.name input').val();
    let formPartnerId = $('.partner-id input').val();
    let formCardId = $('.card-id input').val();

    //create json data
    let inputData = '{' + '"name" : "' + formName + '", ' + '"partnerid" : "' + formPartnerId + '", ' + '"cardid" : "' + formCardId + '"}';
    console.log(inputData);

    //make ajax call to add the dataset
    $.ajax({
        type: 'POST',
        url: apiUrl + 'registerPartner',
        data: inputData,
        dataType: 'json',
        contentType: 'application/json',
        beforeSend: function () {
            //display loading
            document.getElementById('registration').style.display = 'none';
            document.getElementById('loader').style.display = 'block';
        },
        success: function (data) {

            //remove loader
            document.getElementById('loader').style.display = 'none';

            //check data for error
            if (data.error) {
                document.getElementById('registration').style.display = 'block';
                alert(data.error);

            } else {
                //notify successful registration
                document.getElementById('successful-registration').style.display = 'block';
                document.getElementById('registration-info').style.display = 'none';
            }

        },
        error: function (jqXHR, textStatus, errorThrown) {
            //reload on error
            alert('Error: Try again');
            console.log(errorThrown);
            console.log(textStatus);
            console.log(jqXHR);
        }
    });

});

// ========== Password Visibility Toggle (Click to Toggle) ==========
function setupPasswordToggle(toggleBtnId, inputId) {
    var btn = document.getElementById(toggleBtnId);
    if (!btn) return;
    var input = document.getElementById(inputId);

    btn.addEventListener('click', function () {
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);

        // Toggle icon if feather icons are used
        const icon = btn.querySelector('i');
        if (icon) {
            const iconName = type === 'password' ? 'eye' : 'eye-off';
            icon.setAttribute('data-feather', iconName);
            if (window.feather) {
                feather.replace();
            }
        }
    });
}

$(document).ready(function () {
    // Registration Toggles
    setupPasswordToggle('toggleUniPass', 'uniPassword');
    setupPasswordToggle('toggleUniPassConfirm', 'uniPasswordConfirm');
    setupPasswordToggle('toggleStuPass', 'stuPassword');
    setupPasswordToggle('toggleStuPassConfirm', 'stuPasswordConfirm');

    // Login Toggles
    setupPasswordToggle('toggleUniLoginPass', 'uniLoginPassword');
    setupPasswordToggle('toggleStuLoginPass', 'stuLoginPassword');

    // University password match validation
    $('form[action="/university/register/submit"]').on('submit', function (e) {
        var pass = $('#uniPassword').val();
        var confirm = $('#uniPasswordConfirm').val();
        if (pass !== confirm) {
            e.preventDefault();
            $('#uniPassMismatch').fadeIn();
            return false;
        }
        $('#uniPassMismatch').hide();
    });

    // Student password match validation
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

    // Hide mismatch warning on typing
    $('#uniPasswordConfirm, #uniPassword').on('input', function () { $('#uniPassMismatch').fadeOut(); });
    $('#stuPasswordConfirm, #stuPassword').on('input', function () { $('#stuPassMismatch').fadeOut(); });
});
