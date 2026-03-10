'use strict';

let apiUrl = location.protocol + '


$('.sign-in-partner').click(function() {

    
    let formPartnerId = $('.partner-id input').val();
    let formCardId = $('.card-id input').val();

    
    let inputData = '{' + '"partnerid" : "' + formPartnerId + '", ' + '"cardid" : "' + formCardId + '"}';
    console.log(inputData);

    
    $.ajax({
        type: 'POST',
        url: apiUrl + 'partnerData',
        data: inputData,
        dataType: 'json',
        contentType: 'application/json',
        beforeSend: function() {
            
            document.getElementById('loader').style.display = 'block';
        },
        success: function(data) {

            
            document.getElementById('loader').style.display = 'none';

            
            if (data.error) {
                alert(data.error);

            } else {

                
                $('.heading').html(function() {
                    let str = '<h2><b> ' + data.name + ' </b></h2>';
                    str = str + '<h2><b> ' + data.id + ' </b></h2>';

                    return str;
                });

                
                $('.dashboards').html(function() {
                    let str = '';
                    str = str + '<h5>Total points allocated to customers: ' + data.pointsGiven + ' </h5>';
                    str = str + '<h5>Total points redeemed by customers: ' + data.pointsCollected + ' </h5>';
                    return str;
                });

                
                $('.points-allocated-transactions').html(function() {
                    let str = '';
                    let transactionData = data.earnPointsResults;

                    for (let i = 0; i < transactionData.length; i++) {
                        str = str + '<p>timeStamp: ' + transactionData[i].timestamp + '<br />partner: ' + transactionData[i].partner + '<br />member: ' + transactionData[i].member + '<br />points: ' + transactionData[i].points + '<br />transactionID: ' + transactionData[i].transactionId + '</p><br>';
                    }
                    return str;
                });

                
                $('.points-redeemed-transactions').html(function() {
                    let str = '';
                    let transactionData = data.usePointsResults;

                    for (let i = 0; i < transactionData.length; i++) {
                        str = str + '<p>timeStamp: ' + transactionData[i].timestamp + '<br />partner: ' + transactionData[i].partner + '<br />member: ' + transactionData[i].member + '<br />points: ' + transactionData[i].points + '<br />transactionID: ' + transactionData[i].transactionId + '</p><br>';
                    }
                    return str;
                });

                
                document.getElementById('loginSection').style.display = 'none';
                
                document.getElementById('transactionSection').style.display = 'block';
            }

        },
        error: function(jqXHR, textStatus, errorThrown) {
            
            alert('Error: Try again');
            console.log(errorThrown);
            console.log(textStatus);
            console.log(jqXHR);

            location.reload();
        }
    });

});
