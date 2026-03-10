'use strict';

let apiUrl = location.protocol + '

console.log('at register.js');


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


$('.register-member').click(function () {

    
    let formAccountNum = $('.account-number input').val();
    let formCardId = $('.card-id input').val();
    let formFirstName = $('.first-name input').val();
    let formLastName = $('.last-name input').val();
    let formEmail = $('.email input').val();
    let formPhoneNumber = $('.phone-number input').val();

    
    let inputData = '{' + '"firstname" : "' + formFirstName + '", ' + '"lastname" : "' + formLastName + '", ' + '"email" : "' + formEmail + '", ' + '"phonenumber" : "' + formPhoneNumber + '", ' + '"accountnumber" : "' + formAccountNum + '", ' + '"cardid" : "' + formCardId + '"}';
    console.log(inputData);

    
    $.ajax({
        type: 'POST',
        url: apiUrl + 'registerMember',
        data: inputData,
        dataType: 'json',
        contentType: 'application/json',
        beforeSend: function () {
            
            document.getElementById('registration').style.display = 'none';
            document.getElementById('loader').style.display = 'block';
        },
        success: function (data) {

            
            document.getElementById('loader').style.display = 'none';

            
            if (data.error) {
                document.getElementById('registration').style.display = 'block';
                alert(data.error);

            } else {
                
                document.getElementById('successful-registration').style.display = 'block';
                document.getElementById('registration-info').style.display = 'none';
            }

        },
        error: function (jqXHR, textStatus, errorThrown) {
            
            alert('Error: Try again');
            console.log(errorThrown);
            console.log(textStatus);
            console.log(jqXHR);
        }
    });

});



$('.register-partner').click(function () {

    
    let formName = $('.name input').val();
    let formPartnerId = $('.partner-id input').val();
    let formCardId = $('.card-id input').val();

    
    let inputData = '{' + '"name" : "' + formName + '", ' + '"partnerid" : "' + formPartnerId + '", ' + '"cardid" : "' + formCardId + '"}';
    console.log(inputData);

    
    $.ajax({
        type: 'POST',
        url: apiUrl + 'registerPartner',
        data: inputData,
        dataType: 'json',
        contentType: 'application/json',
        beforeSend: function () {
            
            document.getElementById('registration').style.display = 'none';
            document.getElementById('loader').style.display = 'block';
        },
        success: function (data) {

            
            document.getElementById('loader').style.display = 'none';

            
            if (data.error) {
                document.getElementById('registration').style.display = 'block';
                alert(data.error);

            } else {
                
                document.getElementById('successful-registration').style.display = 'block';
                document.getElementById('registration-info').style.display = 'none';
            }

        },
        error: function (jqXHR, textStatus, errorThrown) {
            
            alert('Error: Try again');
            console.log(errorThrown);
            console.log(textStatus);
            console.log(jqXHR);
        }
    });

});


function setupPasswordToggle(toggleBtnId, inputId) {
    var btn = document.getElementById(toggleBtnId);
    if (!btn) return;
    var input = document.getElementById(inputId);

    btn.addEventListener('click', function () {
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);

        
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
    
    setupPasswordToggle('toggleUniPass', 'uniPassword');
    setupPasswordToggle('toggleUniPassConfirm', 'uniPasswordConfirm');
    setupPasswordToggle('toggleStuPass', 'stuPassword');
    setupPasswordToggle('toggleStuPassConfirm', 'stuPasswordConfirm');

    
    setupPasswordToggle('toggleUniLoginPass', 'uniLoginPassword');
    setupPasswordToggle('toggleStuLoginPass', 'stuLoginPassword');

    
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

    
    $('#uniPasswordConfirm, #uniPassword').on('input', function () { $('#uniPassMismatch').fadeOut(); });
    $('#stuPasswordConfirm, #stuPassword').on('input', function () { $('#stuPassMismatch').fadeOut(); });
});
